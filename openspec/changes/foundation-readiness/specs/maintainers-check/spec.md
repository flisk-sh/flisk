# Spec Delta

## Purpose

Give the CLI a check that reports whether the maintainer file meets the published diversity rule.

## ADDED Requirements

### Requirement: Check command

The CLI SHALL provide `flisk maintainers check`, which reads MAINTAINERS.md and counts distinct Company values, treating "Independent" as its own company.

#### Scenario: Short of the bar

- **WHEN** the table has fewer than 3 people or fewer than 2 companies
- **THEN** the command exits 1 and prints "not eligible" with the missing people count and company count

#### Scenario: Bar met

- **WHEN** the table has at least 3 people and at least 2 companies
- **THEN** the command exits 0 and prints the people count and company count

#### Scenario: Missing file

- **WHEN** MAINTAINERS.md is absent
- **THEN** the command exits 1 and names the missing file
