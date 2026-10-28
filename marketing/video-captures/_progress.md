# Walkthrough complete — 16 screenshots (localhost:3000, big_test_dataset.csv 60k rows)

Account: demo.user.2026@example.com (مستخدم تجريبي, ANALYST)
Note: 01-landing.png is a duplicate/first-attempt blank-page shot — exclude from video or delete.

1. 01-landing-login.png — login screen
2. 02-register-form.png — register form filled
3. 03-dashboard-home.png — workspace after signup
4. 04-datasets-empty.png — empty repository
5. 05-upload-in-progress.png — upload modal, 60,000 rows / 11 cols schema inference
6. 06-upload-complete.png — saved dataset, quality 96.7%
7. 07-explorer-filter.png — filter city contains دمشق → 4,566 rows
8. 08-nl2sql-question.png — Arabic question typed in NL2SQL lab
9. 09-nl2sql-ai-model-config.png — HONEST ERROR SHOT: generate redirected to model config (AI provider not connected), plus earlier UNKNOWN_COLUMN hallucination (revenue/profit) and 69% confidence
10. 10-nl2sql-sandbox-result.png — corrected SQL executed in 9-layer sandbox, 13 rows / 26.6ms, top cities
11. 11-erd-modeling.png — ERD studio, single table with columns + PK
12. 12-profiling.png — profiling: 96.7% health, 18,699 nulls, 15 outliers, histogram
13. 13-dashboards.png — dashboard created (empty, before chart)
14. 14-reports.png — manual story report rendered (AI generation produced nothing → manual authoring used)
15. 15-model-arena.png — Model Arena: 4 models scored 95/97/93/92 with SQL per model
16. 16-dashboard-chart.png — BAR chart "إجمالي المبيعات حسب المدينة" added to dashboard, autosaved 11:32

Known limitations to state honestly in video: AI narrative/NL2SQL generation requires a connected AI provider (top bar shows "AI غير مُفعّل").
