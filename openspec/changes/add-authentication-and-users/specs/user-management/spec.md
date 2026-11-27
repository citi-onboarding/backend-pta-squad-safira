## ADDED Requirements

### Requirement: Only administrators manage users

The system SHALL allow listing, creating, updating, and resetting the password of users only to the Administrator role.

#### Scenario: Non-administrator

- **WHEN** a signed-in salesperson, sales manager, or finance user calls any user management route
- **THEN** the system responds 403

#### Scenario: No session

- **WHEN** a request without a session calls any user management route
- **THEN** the system responds 401

### Requirement: List users

The system SHALL return every user with `id`, `nome`, `email`, `papel`, `ativo`, and `codigoVendedor`. The response MUST NOT contain a password or a password hash.

#### Scenario: Administrator lists users

- **WHEN** an administrator lists users
- **THEN** the system responds 200 with every user and no password or hash field

### Requirement: Create a user

The system SHALL create a user from a name, email, role, initial password, and, for a salesperson, the ERP salesperson code. The email MUST be stored without surrounding spaces and in lowercase. The initial password MUST have at least 8 characters. A salesperson MUST have a salesperson code when created; the other roles MAY be created without one. Administrators MAY create other administrators. The password MUST be stored only as a hash, and the response MUST NOT contain it.

#### Scenario: Valid user

- **WHEN** an administrator creates a user with valid data
- **THEN** the system responds 201 with the new user without the password, and the new user can sign in with that password

#### Scenario: Email already registered

- **WHEN** an administrator creates a user with an email that already exists, in any letter case
- **THEN** the system responds 409 and creates nothing

#### Scenario: Email with uppercase letters

- **WHEN** an administrator creates a user with an email that has uppercase letters or surrounding spaces
- **THEN** the system responds 201 and returns and stores the email trimmed and in lowercase

#### Scenario: Simultaneous creation with the same email

- **WHEN** two requests create users with the same email at the same time
- **THEN** one responds 201 and the other responds 409, never 500

#### Scenario: Invalid data

- **WHEN** an administrator creates a user with an invalid email, an empty name, or a password shorter than 8 characters
- **THEN** the system responds 400 and creates nothing

#### Scenario: Salesperson without salesperson code

- **WHEN** an administrator creates a salesperson without an ERP salesperson code
- **THEN** the system responds 400 and creates nothing

#### Scenario: Other role without salesperson code

- **WHEN** an administrator creates a sales manager, a finance user, or an administrator without an ERP salesperson code
- **THEN** the system responds 201

#### Scenario: Salesperson code already linked

- **WHEN** an administrator creates a salesperson with an ERP salesperson code already linked to another user
- **THEN** the system responds 409 and creates nothing

#### Scenario: Administrator creates another administrator

- **WHEN** an administrator creates a user with the Administrator role
- **THEN** the system responds 201, and the new administrator can manage users

### Requirement: Update a user

The system SHALL let an administrator change a user's name, role, active flag, and ERP salesperson code. After the change, a salesperson MUST have a salesperson code, and a salesperson code MUST NOT be linked to two users. When a user leaves the salesperson role, the salesperson code is kept and no longer used. At least one active administrator MUST remain.

#### Scenario: Deactivate a user

- **WHEN** an administrator deactivates a user
- **THEN** the system responds 200, and that user can no longer sign in

#### Scenario: Change the role

- **WHEN** an administrator changes a user's role
- **THEN** the system responds 200, and the user's next request uses the new role

#### Scenario: Unknown user

- **WHEN** an administrator updates a user id that does not exist
- **THEN** the system responds 404

#### Scenario: Becoming a salesperson without a salesperson code

- **WHEN** an administrator changes the role of a user without a salesperson code to salesperson and sends no salesperson code
- **THEN** the system responds 400 and changes nothing

#### Scenario: Becoming a salesperson with a salesperson code

- **WHEN** an administrator changes the role of a user to salesperson and sends a salesperson code that no other user has
- **THEN** the system responds 200 with the new role and salesperson code

#### Scenario: Setting the salesperson code of a salesperson

- **WHEN** an administrator sends a new salesperson code for a salesperson
- **THEN** the system responds 200 with the new salesperson code

#### Scenario: Salesperson code linked to another user

- **WHEN** an administrator sends a salesperson code that is already linked to another user
- **THEN** the system responds 409 and changes nothing

#### Scenario: Removing the code of a salesperson

- **WHEN** an administrator sends an empty salesperson code for a user who stays a salesperson
- **THEN** the system responds 400 and changes nothing

#### Scenario: Leaving the salesperson role

- **WHEN** an administrator changes a salesperson's role to another role
- **THEN** the system responds 200 and the salesperson code is kept

#### Scenario: Deactivating or demoting the last active administrator

- **WHEN** an administrator deactivates the only active administrator, or changes its role, including their own account
- **THEN** the system responds 409 and changes nothing

### Requirement: Reset a password

The system SHALL let an administrator set a new password for a user. The new password MUST have at least 8 characters. After the reset, only the new password MUST work.

#### Scenario: Password reset

- **WHEN** an administrator resets a user's password
- **THEN** the system responds 204, the old password no longer signs in, and the new password does

#### Scenario: New password too short

- **WHEN** an administrator resets a user's password to one shorter than 8 characters
- **THEN** the system responds 400 and the old password keeps working

### Requirement: Development users

The development seed SHALL create one user for each of the four roles, with passwords read only from environment variables.

#### Scenario: Seeded users sign in

- **WHEN** the seed runs with the password variables set
- **THEN** each of the four seeded users can sign in with the password from the environment

#### Scenario: Missing password variable

- **WHEN** the seed runs without the password variables
- **THEN** the seed stops with a clear error and creates no user with a default password
