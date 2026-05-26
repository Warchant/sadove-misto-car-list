export type CarRecord = {
  id: string;
  sheetRow: number;
  plate: string;
  phone: string;
  brand: string;
  color: string;
  notes: string;
};

export type NewCarRecord = Omit<CarRecord, "id" | "sheetRow">;

const API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const HEADERS = ["Номер авто", "Телефон", "Марка", "Колір", "Нотатки"];

function encodeSheetRange(sheetName: string, range: string) {
  return `${encodeURIComponent(`'${sheetName}'!${range}`)}`;
}

function valuesToRecords(values: string[][] = []): CarRecord[] {
  return values.slice(1).flatMap((row, index) => {
    const [plate = "", phone = "", brand = "", color = "", notes = ""] = row;
    const sheetRow = index + 2;

    if (![plate, phone, brand, color, notes].some(Boolean)) {
      return [];
    }

    return {
      id: `${sheetRow}-${plate}-${phone}`,
      sheetRow,
      plate,
      phone,
      brand,
      color,
      notes,
    };
  });
}

async function sheetsFetch<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      body?.error?.message ?? `Google Sheets API повернув ${response.status}.`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function fetchCarRecords(config: {
  accessToken: string;
  sheetId: string;
  sheetName: string;
}) {
  const range = encodeSheetRange(config.sheetName, "A:E");
  const data = await sheetsFetch<{ values?: string[][] }>(
    `${config.sheetId}/values/${range}`,
    config.accessToken,
  );

  return valuesToRecords(data.values);
}

export async function appendCarRecord(config: {
  accessToken: string;
  sheetId: string;
  sheetName: string;
  record: NewCarRecord;
}) {
  const range = encodeSheetRange(config.sheetName, "A:E");

  await sheetsFetch(
    `${config.sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    config.accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        values: [
          [
            config.record.plate.trim().toUpperCase(),
            config.record.phone.trim(),
            config.record.brand.trim(),
            config.record.color.trim(),
            config.record.notes.trim(),
          ],
        ],
      }),
    },
  );
}

export async function ensureHeaderRow(config: {
  accessToken: string;
  sheetId: string;
  sheetName: string;
}) {
  const range = encodeSheetRange(config.sheetName, "A1:E1");
  const data = await sheetsFetch<{ values?: string[][] }>(
    `${config.sheetId}/values/${range}`,
    config.accessToken,
  );

  if (data.values?.[0]?.some(Boolean)) {
    return;
  }

  await sheetsFetch(
    `${config.sheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    config.accessToken,
    {
      method: "PUT",
      body: JSON.stringify({ values: [HEADERS] }),
    },
  );
}

export async function deleteCarRecord(config: {
  accessToken: string;
  sheetId: string;
  sheetName: string;
  sheetRow: number;
}) {
  const spreadsheet = await sheetsFetch<{
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  }>(config.sheetId, config.accessToken);

  const sheet = spreadsheet.sheets?.find(
    (item) => item.properties?.title === config.sheetName,
  );

  if (sheet?.properties?.sheetId === undefined) {
    throw new Error(`Аркуш "${config.sheetName}" не знайдено.`);
  }

  await sheetsFetch(`${config.sheetId}:batchUpdate`, config.accessToken, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheet.properties.sheetId,
              dimension: "ROWS",
              startIndex: config.sheetRow - 1,
              endIndex: config.sheetRow,
            },
          },
        },
      ],
    }),
  });
}
