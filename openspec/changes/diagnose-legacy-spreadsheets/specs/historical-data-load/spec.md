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

Cells that hold a formula without a saved result SHALL be counted as formulas, never as empty values. Date formats SHALL be named as `Excel date`, `Excel serial number` (a five-digit day count written as text), `dd/mm/yyyy`, `dd/mm/yy`, `dd.mm.yyyy`, `dd-mm-yyyy`, or `yyyy-mm-dd`, and every named format SHALL be understood when counting receivables from 2026-10-01; value formats as `number`, `text with decimal comma`, or `text with decimal point`. Any other text SHALL be described by its shape (each digit shown as `9` and each letter as `a`, for example `99 aaa`), never by its value.

#### Scenario: Counts and types

- **WHEN** a sample spreadsheet has 3 content rows, 1 blank row, and 1 empty `CNPJ`
- **THEN** the document reports 3 content rows, 1 blank row, and 1 empty value in `CNPJ`

#### Scenario: Formula without a saved result

- **WHEN** a sample `Total` cell holds a formula without a saved result
- **THEN** the document counts it as a formula in `Total`, not as an empty value

#### Scenario: Other date and value formats

- **WHEN** sample date cells hold `03.02.2025`, `03/02/25`, and `03-02-2025`, and a sample quantity cell holds `10 cx`
- **THEN** the document reports the formats `dd.mm.yyyy`, `dd/mm/yy`, and `dd-mm-yyyy`, and the shape `99 aa` for the quantity, without the values themselves

#### Scenario: Excel serial numbers in a date column

- **WHEN** sample receivables have `data_emissao` written as `46295` (2026-09-30) and `46296` (2026-10-01)
- **THEN** the document reports the format `Excel serial number` and counts 1 receivable that will come from the ERP

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
- outdated status: a receivable with a payment date whose status is not paid, or a paid status without a payment date;
- status written in different ways: in the orders `Status` and the receivables `status` columns, spellings that become equal after trimming and ignoring letter case and accents but are not written identically; the rows that do not use the most common spelling of their status are counted;
- salespeople identified by name: non-empty `Vendedor` cells in the clients and orders files, because they hold names while the portal links a salesperson by ERP code; the report also states how many distinct spellings each file has, without the names;
- missing required values: a client without `Cód.`, an order item without `Produto`, or a receivable without `id_cliente`;
- CNPJ in different formats: a `CNPJ` column holding more than one of masked text, digits-only text, and an Excel number; the rows that do not use the most common format are counted.

#### Scenario: Problem found

- **WHEN** the sample clients file has two rows for "Construtora Exemplo Ltda" and "CONSTRUTORA EXEMPLO LTDA."
- **THEN** the document reports "clients written in different ways" as found, with 2 rows and both row numbers

#### Scenario: Problem not found

- **WHEN** the sample files have no total line
- **THEN** the document reports "total lines" as not found, with 0 rows

#### Scenario: Status written in different ways

- **WHEN** the sample receivables have the statuses `PAGO`, `PAGO`, and `pago `
- **THEN** the document reports "status written in different ways" as found, with 1 row

#### Scenario: Salespeople identified by name

- **WHEN** the sample orders have `Vendedor` filled in 3 rows with 2 distinct spellings
- **THEN** the document reports "salespeople identified by name" as found, with 3 rows and 2 distinct spellings, without the names

#### Scenario: Invalid CNPJ

- **WHEN** a sample client has the CNPJ `11.222.333/0001-82`, whose last check digit is wrong
- **THEN** the document counts it as an invalid CNPJ

### Requirement: Volumes compared with the task

The document SHALL compare the row counts of each file with the volumes the task expects (135 clients, about 9,700 orders, and about 6,500 receivables) and explain each difference with the counts it found (blank rows, total lines, item rows, and distinct orders).

#### Scenario: Orders counted by item

- **WHEN** the orders file has more item rows than the task's expected volume
- **THEN** the document states the expected volume, the item rows, and the distinct orders, and explains that the file has one row per item

### Requirement: Receivables that will come from the ERP

The diagnosis SHALL report how many receivables have an issue date on or after 2026-10-01, because from that date the ERP is the source of receivables.

#### Scenario: Receivables from October 2026

- **WHEN** the sample receivables file has 2 rows issued before 2026-10-01 and 1 row issued on 2026-10-01
- **THEN** the document reports 1 receivable that will come from the ERP

### Requirement: Column match with the ERP

The diagnosis SHALL list every spreadsheet column with the matching field in the portal data model (DATA-01) and in the ERP contract (BACK-02), or state that there is no match, and SHALL state the conversion a column needs before it can be loaded (for example, a salesperson name to an ERP salesperson code, or reais to integer cents).

#### Scenario: Matching and unmatched columns

- **WHEN** the document lists the clients file columns
- **THEN** `CNPJ` appears with its matching fields in both references and the conversion "normalize to 14 digits", and a column with no counterpart (for example, `Telefone`) appears as "no match"

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
