## Purpose

Defines how ERP monetary values, always integer cents (RN-13), are converted to
reais and presented in Brazilian Real without floating-point drift at the source.

## ADDED Requirements

### Requirement: Cents to reais conversion

The service SHALL convert an integer amount of cents to reais by dividing by
100 and MUST reject amounts that are not safe integers.

#### Scenario: Integer cents are converted

- **WHEN** `12345` cents are converted
- **THEN** the result is `123.45` reais

#### Scenario: Fractional cents are rejected

- **WHEN** `10.5` cents are converted
- **THEN** the conversion fails

### Requirement: Brazilian Real formatting

The service SHALL format an integer amount of cents as Brazilian Real using the
`pt-BR` locale, with two decimal places, comma as decimal separator, and dot as
thousands separator, and MUST reject amounts that are not safe integers.

#### Scenario: Amount is formatted

- **WHEN** `123456789` cents are formatted
- **THEN** the result is `R$ 1.234.567,89` (with a non-breaking space after `R$`)

#### Scenario: Zero and negative amounts are formatted

- **WHEN** `0` and `-150` cents are formatted
- **THEN** the results are `R$ 0,00` and `-R$ 1,50`

#### Scenario: Fractional cents are rejected

- **WHEN** `0.1` cents are formatted
- **THEN** the formatting fails
