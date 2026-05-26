import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Car,
  ChevronDown,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Select } from "./components/ui/select";
import { Textarea } from "./components/ui/textarea";
import {
  appendCarRecord,
  deleteCarRecord,
  ensureHeaderRow,
  fetchCarRecords,
  type CarRecord,
  type NewCarRecord,
} from "./lib/sheets";
import {
  loadGoogleIdentityScript,
  type GoogleTokenClient,
} from "./lib/googleAuth";
import { cn } from "./lib/utils";

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

const SHEET_CONFIG = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined,
  sheetId: import.meta.env.VITE_GOOGLE_SHEET_ID as string | undefined,
  sheetName: (import.meta.env.VITE_GOOGLE_SHEET_NAME as string | undefined) ?? "Cars",
};

type SortKey = "plate" | "phone" | "brand" | "color";
type SortDirection = "asc" | "desc";
type MobilePanel = "add" | "filters" | "table";

const emptyRecord: NewCarRecord = {
  plate: "",
  phone: "",
  brand: "",
  color: "",
  notes: "",
};

function uniqueValues(records: CarRecord[], key: "brand" | "color") {
  return Array.from(new Set(records.map((record) => record[key]).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b, "uk"),
  );
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("uk");
}

function App() {
  const [tokenClient, setTokenClient] = useState<GoogleTokenClient | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [records, setRecords] = useState<CarRecord[]>([]);
  const [query, setQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("plate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [newRecord, setNewRecord] = useState<NewCarRecord>(emptyRecord);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingRow, setDeletingRow] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [openMobilePanels, setOpenMobilePanels] = useState<
    Record<MobilePanel, boolean>
  >({
    add: false,
    filters: false,
    table: true,
  });

  const isConfigured = Boolean(SHEET_CONFIG.clientId && SHEET_CONFIG.sheetId);
  const canUseSheets = isConfigured && Boolean(accessToken);

  useEffect(() => {
    if (!SHEET_CONFIG.clientId) {
      return;
    }

    loadGoogleIdentityScript()
      .then(() => {
        const client = window.google!.accounts.oauth2.initTokenClient({
          client_id: SHEET_CONFIG.clientId!,
          scope: GOOGLE_SCOPE,
          callback: (response) => {
            if (response.error) {
              setError(response.error_description ?? response.error);
              return;
            }

            if (response.access_token) {
              setAccessToken(response.access_token);
              setError("");
            }
          },
        });
        setTokenClient(client);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const loadRecords = useCallback(
    async (token = accessToken) => {
      if (!token || !SHEET_CONFIG.sheetId) {
        return;
      }

      setIsLoading(true);
      setError("");

      try {
        const nextRecords = await fetchCarRecords({
          accessToken: token,
          sheetId: SHEET_CONFIG.sheetId,
          sheetName: SHEET_CONFIG.sheetName,
        });
        setRecords(nextRecords);
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "Не вдалося прочитати таблицю.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    if (accessToken) {
      void loadRecords(accessToken);
    }
  }, [accessToken, loadRecords]);

  const brands = useMemo(() => uniqueValues(records, "brand"), [records]);
  const colors = useMemo(() => uniqueValues(records, "color"), [records]);

  const visibleRecords = useMemo(() => {
    const search = normalize(query);

    return records
      .filter((record) => {
        const matchesSearch =
          !search ||
          [record.plate, record.phone, record.brand, record.color, record.notes]
            .map(normalize)
            .some((value) => value.includes(search));
        const matchesBrand = brandFilter === "all" || record.brand === brandFilter;
        const matchesColor = colorFilter === "all" || record.color === colorFilter;

        return matchesSearch && matchesBrand && matchesColor;
      })
      .sort((a, b) => {
        const modifier = sortDirection === "asc" ? 1 : -1;
        return a[sortKey].localeCompare(b[sortKey], "uk", {
          numeric: true,
          sensitivity: "base",
        }) * modifier;
      });
  }, [brandFilter, colorFilter, query, records, sortDirection, sortKey]);

  async function handleAddRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canUseSheets || !SHEET_CONFIG.sheetId) {
      return;
    }

    if (!newRecord.plate.trim() || !newRecord.phone.trim()) {
      setError("Номер авто і телефон обов'язкові.");
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      await ensureHeaderRow({
        accessToken,
        sheetId: SHEET_CONFIG.sheetId,
        sheetName: SHEET_CONFIG.sheetName,
      });
      await appendCarRecord({
        accessToken,
        sheetId: SHEET_CONFIG.sheetId,
        sheetName: SHEET_CONFIG.sheetName,
        record: newRecord,
      });
      setNewRecord(emptyRecord);
      setNotice("Рядок додано.");
      await loadRecords();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Не вдалося додати рядок. Перевірте write-доступ до Google Sheet.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(record: CarRecord) {
    if (!canUseSheets || !SHEET_CONFIG.sheetId) {
      return;
    }

    const confirmed = window.confirm(`Видалити ${record.plate} / ${record.phone}?`);
    if (!confirmed) {
      return;
    }

    setDeletingRow(record.sheetRow);
    setError("");
    setNotice("");

    try {
      await deleteCarRecord({
        accessToken,
        sheetId: SHEET_CONFIG.sheetId,
        sheetName: SHEET_CONFIG.sheetName,
        sheetRow: record.sheetRow,
      });
      setNotice("Рядок видалено.");
      await loadRecords();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Не вдалося видалити рядок. Перевірте write-доступ до Google Sheet.",
      );
    } finally {
      setDeletingRow(null);
    }
  }

  function signIn() {
    setError("");
    tokenClient?.requestAccessToken({ prompt: accessToken ? "" : "consent" });
  }

  function signOut() {
    setAccessToken("");
    setRecords([]);
    setNotice("");
  }

  function toggleMobilePanel(panel: MobilePanel) {
    setOpenMobilePanels((current) => ({
      ...current,
      [panel]: !current[panel],
    }));
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Car className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-normal">Авто ЖХК</h1>
              <p className="text-sm text-muted-foreground">
                Номери авто, телефони, марки та кольори
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {accessToken ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => void loadRecords()}
                  disabled={isLoading}
                  title="Оновити"
                >
                  <RefreshCw
                    className={cn("h-4 w-4", isLoading && "animate-spin")}
                    aria-hidden="true"
                  />
                </Button>
                <Button type="button" variant="outline" onClick={signOut}>
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Вийти
                </Button>
              </>
            ) : (
              <Button type="button" onClick={signIn} disabled={!tokenClient || !isConfigured}>
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Увійти Google
              </Button>
            )}
          </div>
        </header>

        {!isConfigured ? (
          <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Додайте VITE_GOOGLE_CLIENT_ID і VITE_GOOGLE_SHEET_ID у .env.
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {notice}
          </div>
        ) : null}

        {!accessToken ? (
          <div className="grid flex-1 place-items-center py-12">
            <div className="w-full max-w-md rounded-md border border-border bg-card p-5 shadow-soft">
              <h2 className="text-lg font-semibold">Підключіть Google Sheet</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Доступ контролюється самим Google Sheet. Користувачі з view-доступом
                можуть читати, а з editor-доступом можуть додавати і видаляти рядки.
              </p>
              <Button
                type="button"
                className="mt-5 w-full"
                onClick={signIn}
                disabled={!tokenClient || !isConfigured}
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Увійти через Google
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 py-5 lg:grid-cols-[360px_1fr]">
            <aside className="space-y-3 lg:space-y-5">
              <form
                className="overflow-hidden rounded-md border border-border bg-card shadow-soft lg:p-4"
                onSubmit={handleAddRecord}
              >
                <button
                  type="button"
                  className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left lg:hidden"
                  onClick={() => toggleMobilePanel("add")}
                  aria-expanded={openMobilePanels.add}
                >
                  <span className="inline-flex items-center gap-2 text-base font-semibold">
                    <Plus className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    Додати авто
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 text-muted-foreground transition-transform",
                      openMobilePanels.add && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </button>

                <div className="mb-4 hidden items-center justify-between gap-3 lg:flex">
                  <h2 className="text-base font-semibold">Додати авто</h2>
                  <Plus className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </div>

                <div
                  className={cn(
                    "space-y-3 px-4 pb-4 lg:block lg:px-0 lg:pb-0",
                    !openMobilePanels.add && "hidden",
                  )}
                >
                  <label className="block text-sm font-medium">
                    Номер авто
                    <Input
                      className="mt-1 uppercase"
                      placeholder="AA1234BB"
                      value={newRecord.plate}
                      onChange={(event) =>
                        setNewRecord((record) => ({
                          ...record,
                          plate: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Телефон
                    <Input
                      className="mt-1"
                      inputMode="tel"
                      placeholder="+380..."
                      value={newRecord.phone}
                      onChange={(event) =>
                        setNewRecord((record) => ({
                          ...record,
                          phone: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium">
                      Марка
                      <Input
                        className="mt-1"
                        placeholder="Toyota"
                        value={newRecord.brand}
                        onChange={(event) =>
                          setNewRecord((record) => ({
                            ...record,
                            brand: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      Колір
                      <Input
                        className="mt-1"
                        placeholder="Сірий"
                        value={newRecord.color}
                        onChange={(event) =>
                          setNewRecord((record) => ({
                            ...record,
                            color: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label className="block text-sm font-medium">
                    Нотатки
                    <Textarea
                      className="mt-1"
                      placeholder="Під'їзд, місце, коментар"
                      value={newRecord.notes}
                      onChange={(event) =>
                        setNewRecord((record) => ({
                          ...record,
                          notes: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                <Button type="submit" className="mt-4 w-full" disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  )}
                  Додати рядок
                </Button>
              </form>

              <div className="overflow-hidden rounded-md border border-border bg-card shadow-soft lg:p-4">
                <button
                  type="button"
                  className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left lg:hidden"
                  onClick={() => toggleMobilePanel("filters")}
                  aria-expanded={openMobilePanels.filters}
                >
                  <span className="inline-flex items-center gap-2 text-base font-semibold">
                    <SlidersHorizontal
                      className="h-5 w-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                    Фільтри
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 text-muted-foreground transition-transform",
                      openMobilePanels.filters && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </button>

                <div className="mb-4 hidden items-center gap-2 lg:flex">
                  <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-base font-semibold">Фільтри</h2>
                </div>
                <div
                  className={cn(
                    "space-y-3 px-4 pb-4 lg:block lg:px-0 lg:pb-0",
                    !openMobilePanels.filters && "hidden",
                  )}
                >
                  <label className="block text-sm font-medium">
                    Марка
                    <Select
                      className="mt-1"
                      value={brandFilter}
                      onChange={(event) => setBrandFilter(event.target.value)}
                    >
                      <option value="all">Усі марки</option>
                      {brands.map((brand) => (
                        <option key={brand} value={brand}>
                          {brand}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="block text-sm font-medium">
                    Колір
                    <Select
                      className="mt-1"
                      value={colorFilter}
                      onChange={(event) => setColorFilter(event.target.value)}
                    >
                      <option value="all">Усі кольори</option>
                      {colors.map((color) => (
                        <option key={color} value={color}>
                          {color}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <label className="block text-sm font-medium">
                      Сортування
                      <Select
                        className="mt-1"
                        value={sortKey}
                        onChange={(event) => setSortKey(event.target.value as SortKey)}
                      >
                        <option value="plate">За номером</option>
                        <option value="phone">За телефоном</option>
                        <option value="brand">За маркою</option>
                        <option value="color">За кольором</option>
                      </Select>
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="self-end"
                      onClick={() =>
                        setSortDirection((direction) =>
                          direction === "asc" ? "desc" : "asc",
                        )
                      }
                      title="Змінити напрямок сортування"
                    >
                      {sortDirection === "asc" ? (
                        <ArrowDownAZ className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ArrowUpAZ className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </aside>

            <section className="min-w-0 overflow-hidden rounded-md border border-border bg-card shadow-soft lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none">
              <button
                type="button"
                className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left lg:hidden"
                onClick={() => toggleMobilePanel("table")}
                aria-expanded={openMobilePanels.table}
              >
                <span className="inline-flex items-center gap-2 text-base font-semibold">
                  <Search className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  Таблиця
                </span>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 text-muted-foreground transition-transform",
                    openMobilePanels.table && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>

              <div
                className={cn(
                  "lg:block",
                  !openMobilePanels.table && "hidden",
                )}
              >
              <div className="sticky top-0 z-10 border-b border-border bg-card px-4 pb-4 backdrop-blur lg:static lg:border-b-0 lg:bg-transparent lg:px-0 lg:pb-3">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Пошук за номером, телефоном, маркою, кольором..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Знайдено: {visibleRecords.length} з {records.length}
                  </span>
                  {isLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Оновлення
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3 px-4 pb-4 sm:hidden">
                {visibleRecords.map((record) => (
                  <article
                    key={record.id}
                    className="rounded-md border border-border bg-card p-4 shadow-soft"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words text-lg font-semibold uppercase">
                          {record.plate}
                        </h3>
                        <a
                          className="mt-1 block text-sm font-medium text-primary"
                          href={`tel:${record.phone}`}
                        >
                          {record.phone}
                        </a>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleDelete(record)}
                        disabled={deletingRow === record.sheetRow}
                        title="Видалити"
                      >
                        {deletingRow === record.sheetRow ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-muted-foreground">Марка</dt>
                        <dd className="font-medium">{record.brand || "-"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Колір</dt>
                        <dd className="font-medium">{record.color || "-"}</dd>
                      </div>
                    </dl>
                    {record.notes ? (
                      <p className="mt-3 break-words text-sm text-muted-foreground">
                        {record.notes}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-md border border-border bg-card shadow-soft sm:block">
                <div className="grid grid-cols-[1.1fr_1.1fr_1fr_1fr_64px] border-b border-border bg-muted px-4 py-3 text-sm font-medium text-muted-foreground">
                  <span>Номер</span>
                  <span>Телефон</span>
                  <span>Марка</span>
                  <span>Колір</span>
                  <span></span>
                </div>
                {visibleRecords.map((record) => (
                  <div
                    key={record.id}
                    className="grid grid-cols-[1.1fr_1.1fr_1fr_1fr_64px] items-center gap-2 border-b border-border px-4 py-3 text-sm last:border-b-0"
                  >
                    <span className="font-semibold uppercase">{record.plate}</span>
                    <a className="font-medium text-primary" href={`tel:${record.phone}`}>
                      {record.phone}
                    </a>
                    <span>{record.brand || "-"}</span>
                    <span>{record.color || "-"}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => void handleDelete(record)}
                      disabled={deletingRow === record.sheetRow}
                      title="Видалити"
                    >
                      {deletingRow === record.sheetRow ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>

              {!isLoading && visibleRecords.length === 0 ? (
                <div className="mx-4 mb-4 rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground lg:mx-0 lg:mb-0">
                  Немає рядків для поточного пошуку або фільтрів.
                </div>
              ) : null}
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
