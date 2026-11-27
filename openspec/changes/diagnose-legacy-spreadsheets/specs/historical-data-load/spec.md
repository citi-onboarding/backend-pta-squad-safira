## ADDED Requirements

### Requirement: Read-only reading of the three spreadsheets

The diagnosis SHALL read `Clientes - Comercial.xlsx`, `Pedidos 2025-2026 - Comercial.xlsx`, and `titulos.csv` from a folder given on the command line, and MUST NOT change, move, or rewrite any of them. Nothing SHALL be written to the portal database.

#### Scenario: Folder with the three files

- **WHEN** the diagnosis runs with a folder that contains the three files
- **THEN** it reads all three, generates the diagnosis document, and every file keeps the same content as before the run

#### Scenario: Missing folder argument

- **WHEN** the diagnosis runs without a folder
- **THEN** it stops with a message that explains how to pass the folder and generates no document

#### Scenario: Missing file

- **WHEN** one of the three files is not in the folder
- **THEN** it stops with a message naming the missing file and generates no document

### Requirement: Header found by column names

The diagnosis SHALL locate the header row of each spreadsheet by the expected column names, ignoring title and blank rows above it. When an expected column is missing, it MUST stop and name the column and the file.

#### Scenario: Title rows above the header

- **WHEN** a spreadsheet has a title row and a blank row before the header
- **THEN** only the rows below the header are counted as content rows

#### Scenario: Missing column

- **WHEN** a spreadsheet has no column named like an expected one (for example, no `CNPJ` in the clients file)
- **THEN** the diagnosis stops with a message naming the missing column and the file

### Requirement: Profile of each spreadsheet

For each file, the diagnosis SHALL report the columns with their inferred types, the number of content rows, blank rows, and total lines, the number of empty values per column, the date formats found in date columns, and the value formats found in money and quantity columns. For the orders file, it SHALL also report the number of distinct order numbers, because the file has one row per item.

#### Scenario: Counts and types

- **WHEN** a sample spreadsheet has 3 content rows, 1 blank row, and 1 empty `CNPJ`
- **THEN** the document reports 3 content rows, 1 blank row, and 1 empty value in `CNPJ`

#### Scenario: Orders and items

- **WHEN** the sample orders file has 4 item rows for 2 order numbers
- **THEN** the document reports 4 item rows and 2 distinct orders

### Requirement: Detection of data problems

The diagnosis SHALL check every problem below and report, for each one, whether it occurs, how many rows it affects, and up to 5 example row numbers:

- clients written in different ways: client names that become equal after ignoring letter case, accents, repeated spaces, and punctuation, but are not written identically;
- invalid CNPJ: a CNPJ without 14 digits or with wrong check digits;
- dates in different formats: one date column holding more than one format (for example, real date cells, `dd/mm/yyyy` text, and `yyyy-mm-dd` text);
- values with a decimal comma: money or quantity cells stored as text with a comma (for example, `1.234,56`);
- duplicates: rows identical in every column, and receivables repeating the same `id_titulo` and `parcela`;
- orders without a client: order rows with an empty client cell;
- clients identified by name: order rows whose client cell does not match a client code from the clients file;
- quantities typed wrong: a quantity that is not a positive whole number, or a row where quantity times unit price differs from its total by more than one cent;
- total lines: rows whose first filled cell starts with "total" in any letter case;
- outdated status: a receivable with a payment date whose status is not paid, or a paid status without a payment date.

#### Scenario: Problem found

- **WHEN** the sample clients file has two rows for "Construtora Exemplo Ltda" and "CONSTRUTORA EXEMPLO LTDA."
- **THEN** the document reports "clients written in different ways" as found, with 2 rows and both row numbers

#### Scenario: Problem not found

- **WHEN** the sample files have no total line
- **THEN** the document reports "total lines" as not found, with 0 rows

#### Scenario: Invalid CNPJ

- **WHEN** a sample client has the CNPJ `11.222.333/0001-82`, whose last check digit is wrong
- **THEN** the document counts it as an invalid CNPJ

### Requirement: Receivables that will come from the ERP

The diagnosis SHALL report how many receivables have an issue date on or after 2026-10-01, because from that date the ERP is the source of receivables.

#### Scenario: Receivables from October 2026

- **WHEN** the sample receivables file has 2 rows issued before 2026-10-01 and 1 row issued on 2026-10-01
- **THEN** the document reports 1 receivable that will come from the ERP

### Requirement: Column match with the ERP

The diagnosis SHALL list every spreadsheet column with the matching field in the portal data model (DATA-01) and in the ERP contract (BACK-02), or state that there is no match.

#### Scenario: Matching and unmatched columns

- **WHEN** the document lists the clients file columns
- **THEN** `CNPJ` appears with its matching fields in both references, and a column with no counterpart (for example, `Telefone`) appears as "no match"

### Requirement: One proposed cleaning rule per problem

For every problem found, the document SHALL propose one cleaning rule for DATA-03. The rules MUST follow RN-09 (when the spreadsheet and the ERP differ, the ERP wins) and RN-16 (a row that cannot be corrected safely is not loaded and goes to the pending list with its reason).

#### Scenario: Rule for each problem found

- **WHEN** the document reports a problem as found
- **THEN** the same section contains exactly one proposed cleaning rule for it

### Requirement: Repeatable and private output

Running the diagnosis again with the same files SHALL produce a byte-identical document, so it MUST NOT contain the current date, time, or any value that changes between runs. The document and the command output MUST NOT contain client names, phone numbers, contact names, or full CNPJs; CNPJ examples, when shown, are masked except for their last two digits.

#### Scenario: Same result on a second run

- **WHEN** the diagnosis runs twice with the same files
- **THEN** both documents are byte-identical

#### Scenario: No personal data in the document

- **WHEN** the document is generated from the sample files
- **THEN** it contains none of the sample client names, phone numbers, contact names, or full CNPJs
