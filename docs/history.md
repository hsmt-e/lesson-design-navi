# 開発履歴(旧リポジトリの PR との対応)

このリポジトリは、履歴の整理のため、作り直した。コードと、コミットの履歴は、そのまま引き継いでいる。PR とそのコメント、CI の実行履歴は、引き継いでいない。

コミットの題名にある (#12) までの番号は、旧リポジトリの PR 番号で、このリポジトリの PR とは対応しない。このリポジトリの PR は #1 から始まる。

## 旧 PR との対応表

| 旧PR | マージ日 | 題名 | 内容 |
|---|---|---|---|
| 旧#1 | 2026-11-04 | docs: READMEの骨子を追加 | プロジェクトの README の骨子を作成 |
| 旧#2 | 2026-11-04 | chore: Prismaを導入 | データベース(PostgreSQL)と ORM(Prisma)を導入 |
| 旧#3 | 2026-11-05 | docs: 範囲・機能対応・設計判断・利用条件の下書きを追加 | 作る範囲・機能の対応・設計判断・利用条件の下書きを文書化 |
| 旧#4 | 2026-11-05 | feat: add Prisma schema and initial migration | テーブル設計と、最初のマイグレーション |
| 旧#5 | 2026-11-05 | docs: add ER diagram | データ構造の ER 図(mermaid)を追加 |
| 旧#6 | 2026-11-05 | feat: add argon2 password hashing and password schema | パスワードを argon2id でハッシュ化し、12〜128文字の規則を共有スキーマに定義 |
| 旧#7 | 2026-11-05 | feature/session auth | セッション(トークンはハッシュで保存)、Cookie の属性、Origin チェック |
| 旧#8 | 2026-11-05 | chore: untrack apps/api/.agents and .claude, add to gitignore | 自動生成された他社製ファイルを、Git の管理から除外 |
| 旧#9 | 2026-11-06 | ci: add gitleaks secret scan | キーやパスワードの誤コミットを、PR の時点で検出する CI を追加 |
| 旧#10 | - | test: gitleaks dummy(検出の確認用。マージせず閉じた) | gitleaks が、ダミーのキーで CI を赤にすることの確認 |
| 旧#11 | 2026-11-06 | feat: add auth API (register, login, logout, me) with rate limit and load protection | 登録・ログイン・ログアウト・本人確認の API。回数制限と負荷対策 |
| 旧#12 | 2026-11-10 | feat: add requireAuth middleware and protected route group | 認証の確認をミドルウェアに集約し、付け忘れをテストで検出 |

## 開発の進め方

- 1つのタスクを、1つのブランチ、1つの PR にする。PR は、CI(lint・型チェック・テスト・ビルド・シークレット検出)が緑になるまで、マージできない。`main` への直接の push は、禁止している。
- マージは squash。コミットの題名は、`feat:` `fix:` `test:` `docs:` `chore:` で始める。
- 判断の理由は、[decisions.md](decisions.md) に、「何を・なぜ」の形で残している。
