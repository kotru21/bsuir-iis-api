# План реализации: Review fixes (TDD)

Кратко: поэтапный TDD-план для исправления замечаний code-review и внедрения согласованного breaking API.

Файлы: сохранён план здесь.

Фаза 1 — Correctness & Safety (приоритет)
- Цель: устранить ошибки в HTTP pipeline, корректно вызывать hooks, безопасно работать с dedup/AbortSignal.
- Шаги (TDD):
  1. Писать тест, который воспроизводит проблемное поведение `onError` при `BsuirResponsePayloadTooLargeError` (test should fail).
  2. Исправить `src/client/http/response.ts` / `src/client/http/requestJson.ts` — обеспечить вызов `config.hooks.onError` с полным HTTP контекстом (implement).
  3. Запустить тесты по модулю и убедиться в прохождении (verify).
  4. Писать тест воспроизводящий cross-cancellation при dedup + per-call `signal` (fail).
  5. Изменить `src/client/http/requestJson.ts` — отключать dedup при наличии per-call signal, и гарантировать cleanup `inFlightRequests` в finally (implement).
  6. Добавить/отредактировать тесты на кеш/запись (cache semantics) — write-through vs write-back.
  7. Commit: `fix(http): ensure onError called; fix dedup+signal cleanup`.

Фаза 2 — Reliability (retry / parsing / signals)
- Цель: улучшить `retry` парсинг и `mergeSignals` cleanup.
- Шаги (TDD):
  1. Добавить тесты для `parseRetryAfterMs` с HTTP-date и целочисленным числом (fail).
  2. Исправить `src/client/http/retry.ts` — строгое распознавание HTTP-date, корректная `no-retry` логика.
  3. Заменить использование Symbol для cleanup в `src/client/mergeSignals.ts` на WeakMap (preserve tests).
  4. Commit: `fix(http/retry|mergeSignals): robust retry parsing; use WeakMap for signal cleanup`.

Фаза 3 — API Redesign (breaking)
- Цель: убрать `defaultRaw` и неявные перегрузки schedule API; ввести явные методы.
- Шаги (TDD):
  1. Добавить тесты, которые отражают новую API (e.g., `client.schedule.getGroup()` / `getGroupRaw()`).
  2. Удалить `defaultRaw` логику в `src/client/createClient.ts` и реорганизовать `src/modules/scheduleApi.ts` (types + exports).
  3. Обновить документацию и examples (`examples/*`) и README примеры.
  4. Обновить тесты в `test/modules/` чтобы использовать новые методы.
  5. Commit: `feat(api): remove defaultRaw; add explicit schedule methods (breaking)`.

Фаза 4 — Utilities & Cleanup
- Цель: вынести общие утилиты, убрать дубли, улучшить типы.
- Шаги (TDD):
  1. Собрать список дублирующихся утилит (deepFreezeJson, parseDdMmYyyyParts, lessonAuditories).
  2. Вынести в `src/utils/` или `src/client/utils/`, заменить дубли и обновить импорты.
  3. Commit: `refactor(utils): dedupe helpers`.

Фаза 5 — Tests, Docs, Release
- Цель: привести тесты в порядок, обновить changelog, подготовить major release.
- Шаги:
  1. Прогнать весь тест-suite; исправить регрессии, фиксировать мелкие баги отдельными PR/commits.
  2. Обновить `CHANGELOG.md` и `docs/` (breaking changes секция).
  3. Создать changeset и увеличить major версию.

Оформление коммитов
- Использовать короткие, предсказуемые префиксы: `fix(http)`, `feat(api)`, `refactor(utils)`, `test(...)`.

CI / локальная валидация
- Для каждой значимой группы изменений: запускать `pnpm -w test` (или `pnpm test`) локально в ветке.

Порядок выполнения (практический):
1. Phase 1 — закончить все подзадачи (TDD). 2–3 дня локальной работы.
2. Phase 2 — малыми коммитами. 1–2 дня.
3. Phase 3 — breaking changes, обновление тестов и docs. 1–3 дня.
4. Phase 4–5 — финализация, changelog, release.

Следующее действие (немедленно): начать Phase 1 — создать первый тест для `onError`/payload-too-large и зафиксировать failing test.
