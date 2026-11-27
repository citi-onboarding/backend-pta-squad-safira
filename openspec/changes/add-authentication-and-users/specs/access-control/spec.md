## ADDED Requirements

### Requirement: Sign in with email and password

The system SHALL start a session when an active user signs in with a registered email and the matching password. Emails MUST be compared without surrounding spaces and without regard to letter case. The session MUST be kept in an HttpOnly, SameSite cookie, and the response MUST NOT contain the password or the password hash.

#### Scenario: Valid credentials

- **WHEN** an active user signs in with the correct email and password
- **THEN** the system responds 200 with the user's `id`, `nome`, and `papel` and sets an HttpOnly, SameSite session cookie

#### Scenario: Wrong password

- **WHEN** a user signs in with a registered email and a wrong password
- **THEN** the system responds 401 with a generic invalid credentials message that does not say which field is wrong

#### Scenario: Unknown email

- **WHEN** someone signs in with an email that is not registered
- **THEN** the system responds 401 with the same message as a wrong password

#### Scenario: Inactive user

- **WHEN** an inactive user signs in with the correct email and password
- **THEN** the system responds 401 with the same message as a wrong password and sets no session cookie

#### Scenario: Email typed with different letter case

- **WHEN** an active user signs in with their email typed in different letter case or with surrounding spaces, and the correct password
- **THEN** the system responds 200 and starts the session

### Requirement: Sign-in attempt limit

The system SHALL accept at most 10 sign-in attempts per minute from the same IP address, counting successful and failed attempts.

#### Scenario: Too many attempts

- **WHEN** the same IP address sends an 11th sign-in attempt within one minute
- **THEN** the system responds 429 and does not check the credentials

#### Scenario: Attempts within the limit

- **WHEN** the same IP address sends 10 sign-in attempts within one minute
- **THEN** every attempt is answered normally (200 or 401)

### Requirement: Current user

The system SHALL return the signed-in user's `id`, `nome`, and `papel` to a request with a valid session.

#### Scenario: Request with a valid session

- **WHEN** a signed-in user asks for the current user
- **THEN** the system responds 200 with that user's `id`, `nome`, and `papel`

#### Scenario: Request without a session

- **WHEN** a request without a session cookie asks for the current user
- **THEN** the system responds 401

#### Scenario: Tampered session cookie

- **WHEN** a request sends a session cookie whose content was changed
- **THEN** the system responds 401

### Requirement: Sign out

The system SHALL clear the session cookie when the user signs out.

#### Scenario: Sign out

- **WHEN** a signed-in user signs out
- **THEN** the system responds with an instruction that removes the session cookie, and the next request from that client without the cookie receives 401

### Requirement: Session expires after 8 hours without use

The system MUST reject a session that has not been used for 8 hours. Each authenticated request SHALL renew the session cookie and restart the 8-hour count.

#### Scenario: Session idle for more than 8 hours

- **WHEN** a request uses a session whose last renewal was more than 8 hours ago
- **THEN** the system responds 401 and the user must sign in again

#### Scenario: Session used within 8 hours

- **WHEN** a request uses a session whose last renewal was less than 8 hours ago
- **THEN** the request is accepted and the response renews the session cookie for another 8 hours

### Requirement: Current user state comes from the database

On every protected request, the system MUST use the user's current active flag, role, and salesperson code stored in the database, not the values from the moment of sign-in.

#### Scenario: Deactivated during an active session

- **WHEN** an administrator deactivates a user who has a valid session and that user makes a new request
- **THEN** the system responds 401

#### Scenario: Role changed during an active session

- **WHEN** an administrator changes the role of a user who has a valid session and that user calls a route allowed only to the new role
- **THEN** the request is accepted with the new role

### Requirement: Role-based access

The system SHALL allow a protected route only to the roles listed for it, following the permission table in PRD section 4.2.

#### Scenario: Wrong role

- **WHEN** a signed-in salesperson calls a route allowed only to the finance role
- **THEN** the system responds 403

#### Scenario: Allowed role

- **WHEN** a signed-in user calls a route allowed to their role
- **THEN** the request is accepted

#### Scenario: No session on a protected route

- **WHEN** a request without a session calls any protected route
- **THEN** the system responds 401

### Requirement: Salesperson portfolio

A salesperson MUST only access clients whose ERP salesperson code matches the salesperson's own code (RN-08). The sales manager and the finance role SHALL access clients of every portfolio.

#### Scenario: Client from another portfolio

- **WHEN** a salesperson tries to access a client that belongs to another salesperson's portfolio
- **THEN** access is denied

#### Scenario: Client from the own portfolio

- **WHEN** a salesperson accesses a client whose salesperson code matches their own
- **THEN** access is allowed

#### Scenario: Manager or finance

- **WHEN** a sales manager or a finance user accesses a client of any portfolio
- **THEN** access is allowed

#### Scenario: Salesperson without a salesperson code

- **WHEN** a salesperson without a salesperson code tries to access any client, including a client without a salesperson
- **THEN** access is denied

#### Scenario: Administrator

- **WHEN** an administrator tries to access any client
- **THEN** access is denied, because PRD section 4.2 does not give this role access to clients
