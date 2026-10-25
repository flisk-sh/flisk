## ADDED Requirements

### Requirement: Notifications are quiet by default
The extension SHALL avoid user-visible notifications for successful background polling and unchanged non-actionable states.

#### Scenario: Background poll succeeds
- **WHEN** a background status or health poll succeeds
- **THEN** the extension updates internal state without showing a user-visible notification

#### Scenario: Existing issue remains unchanged
- **WHEN** a background poll observes an already-reported issue with the same fingerprint and severity
- **THEN** the extension suppresses duplicate user-visible notifications

### Requirement: Actionable failures notify the user
The extension SHALL notify the user when a new or escalated issue requires attention.

#### Scenario: New critical issue
- **WHEN** a new critical Flisk, Tilt, Docker, Bun, port, or configuration issue is detected
- **THEN** the extension shows a notification with a concise summary and an action to open troubleshooting details

#### Scenario: Issue severity escalates
- **WHEN** a known issue changes to a higher severity
- **THEN** the extension shows a new notification for the escalation

### Requirement: Notifications are user configurable
The extension SHALL provide settings that allow users to control notification categories and quiet behavior.

#### Scenario: User disables stack failure notifications
- **WHEN** stack failure notifications are disabled in settings
- **THEN** the extension records stack failures in the troubleshooting view without showing user-visible stack failure notifications

#### Scenario: User keeps critical notifications enabled
- **WHEN** critical notifications are enabled
- **THEN** the extension continues to notify for critical new or escalated issues

### Requirement: Notification actions route to context
The extension SHALL route notification actions to the relevant stack, resource, command output, or troubleshooting issue.

#### Scenario: User opens issue from notification
- **WHEN** the user selects the notification action to inspect an issue
- **THEN** the extension opens the troubleshooting detail for the issue that triggered the notification

### Requirement: Troubleshooter acts as notification history
The extension SHALL retain actionable notification issues in the Troubleshooter view so users can revisit them after dismissing native VS Code notifications.

#### Scenario: User dismisses notification
- **WHEN** the user dismisses a native VS Code notification for an actionable issue
- **THEN** the issue remains available in the Troubleshooter view until resolved or superseded
