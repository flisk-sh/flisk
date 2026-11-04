// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { Box, Text } from "ink";
import type React from "react";
import type { DetailPanelProps } from "../types/index.js";
import { formatAge } from "../utils/agent-format.js";
import type { AgentOverview } from "../utils/agent-sessions.js";
import { formatDate, getStatusColor, getStatusIcon } from "../utils/formatting.js";
import { getTUIStatusColor, getTUIStatusIcon, useTUITheme } from "./ui-theme.js";

const MAX_LISTED_SESSIONS = 5;

/** Readiness, session count, last activity and the newest sessions of an agent; `null` while the first poll is pending. */
const AgentSection: React.FC<{ agent: AgentOverview | null }> = ({ agent }) => {
  const theme = useTUITheme();
  const row = (label: string, value: string, color: typeof theme.foreground = theme.foreground) => (
    <Box>
      <Text color={theme.muted}>{label}: </Text>
      <Text color={color}>{value}</Text>
    </Box>
  );
  let body: React.ReactNode;
  if (agent === null) {
    body = row("Agent", "checking...", theme.muted);
  } else if (agent.state === "not-running") {
    body = row("Agent", "not running", theme.warning);
  } else {
    const { sessions } = agent;
    const newest = sessions?.sessions[0]?.lastActivity ?? null;
    body = (
      <>
        {row("Ready", agent.ready ? "yes" : "no", agent.ready ? theme.success : theme.warning)}
        {sessions ? (
          <>
            {row("Sessions", String(sessions.total))}
            {row("Last activity", formatAge(newest))}
            {sessions.sessions.slice(0, MAX_LISTED_SESSIONS).map((s) => (
              <Box key={s.sessionId}>
                <Text color={theme.foreground}>{s.sessionId.slice(0, 18)}</Text>
                <Text color={theme.muted}>
                  {" "}
                  {formatAge(s.lastActivity)} {s.status}
                </Text>
              </Box>
            ))}
            {sessions.total > MAX_LISTED_SESSIONS && (
              <Text color={theme.muted}>... {sessions.total - MAX_LISTED_SESSIONS} more</Text>
            )}
          </>
        ) : (
          row("Sessions", "not available (agent has no /sessions)", theme.muted)
        )}
      </>
    );
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.muted} underline>
        Agent
      </Text>
      {body}
    </Box>
  );
};

export const DetailPanel: React.FC<DetailPanelProps> = ({
  stack,
  service,
  stackMetadata,
  agent,
  visible,
}) => {
  const theme = useTUITheme();
  if (!visible) {
    return <Box width={0} />;
  }

  if (service) {
    const title = theme.ascii
      ? `--- ${service.name.toUpperCase()} ---`
      : `\u250C\u2500 ${service.name.toUpperCase()} \u2500\u2510`;
    return (
      <Box
        width={40}
        flexDirection="column"
        borderStyle={theme.ascii ? undefined : "single"}
        borderColor={theme.border}
        paddingX={1}
        paddingY={1}
      >
        <Box marginBottom={1} justifyContent="center">
          <Text color={theme.accent} bold>
            {title}
          </Text>
        </Box>

        <Box flexDirection="column" marginY={1}>
          <Box>
            <Text color={theme.muted}>Name: </Text>
            <Text color={theme.foreground}>{service.name}</Text>
          </Box>
          <Box>
            <Text color={theme.muted}>Stack: </Text>
            <Text color={theme.foreground}>{service.stack || "unknown"}</Text>
          </Box>
          <Box>
            <Text color={theme.muted}>Type: </Text>
            <Text color={theme.warning} bold={theme.highContrast}>
              {(service.stack || "") === "platform" ? "PLATFORM" : "PRODUCT"}
            </Text>
          </Box>
        </Box>

        {agent !== undefined && <AgentSection agent={agent} />}

        <Box marginTop={2}>
          <Text color={theme.muted} dimColor={theme.dimMuted}>
            Press <Text color={theme.accent}>[Esc]</Text> to close
          </Text>
        </Box>
      </Box>
    );
  }

  if (stack && stackMetadata) {
    const statusColor = getTUIStatusColor(theme, getStatusColor(stackMetadata.overallStatus));
    const statusIcon = getTUIStatusIcon(
      theme,
      getStatusIcon(stackMetadata.overallStatus),
      getStatusColor(stackMetadata.overallStatus),
    );
    const title = theme.ascii
      ? `--- ${stack.name.toUpperCase()} ---`
      : `\u250C\u2500 ${stack.name.toUpperCase()} \u2500\u2510`;

    return (
      <Box
        width={40}
        flexDirection="column"
        borderStyle={theme.ascii ? undefined : "single"}
        borderColor={theme.border}
        paddingX={1}
        paddingY={1}
      >
        <Box marginBottom={1} justifyContent="center">
          <Text color={theme.accent} bold>
            {title}
          </Text>
        </Box>

        <Box
          borderStyle={theme.ascii ? undefined : "single"}
          borderColor={statusColor}
          paddingX={1}
          paddingY={1}
          marginY={1}
          justifyContent="center"
        >
          <Text color={statusColor} bold>
            {statusIcon} {stackMetadata.overallStatus.toUpperCase()}
          </Text>
        </Box>

        <Box flexDirection="column" marginY={1}>
          <Box>
            <Text color={theme.muted}>Created: </Text>
            <Text color={theme.foreground}>{formatDate(stackMetadata.createdAt)}</Text>
          </Box>
          <Box>
            <Text color={theme.muted}>Resources: </Text>
            <Text color={theme.accent} bold={theme.highContrast}>
              {stackMetadata.resourceCount}
            </Text>
          </Box>
        </Box>

        <Box marginTop={1} marginBottom={1}>
          <Text color={theme.muted} underline>
            Resources
          </Text>
        </Box>

        <Box flexDirection="column">
          {stack.resources.map((svc: { name: string }, index: number) => (
            <Box key={svc.name}>
              <Text color={theme.muted}>
                {theme.ascii
                  ? index === stack.resources.length - 1
                    ? "L- "
                    : "|- "
                  : index === stack.resources.length - 1
                    ? "\u2514\u2500 "
                    : "\u251C\u2500 "}
              </Text>
              <Text color={theme.foreground}>{svc.name}</Text>
            </Box>
          ))}
        </Box>

        <Box marginTop={2}>
          <Text color={theme.muted} dimColor={theme.dimMuted}>
            Press <Text color={theme.accent}>[Esc]</Text> to close
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      width={40}
      borderStyle={theme.ascii ? undefined : "single"}
      borderColor={theme.border}
      paddingX={2}
      paddingY={2}
      flexDirection="column"
    >
      <Box marginBottom={1} justifyContent="center">
        <Text color={theme.muted} dimColor={theme.dimMuted}>
          Select a stack or service
        </Text>
      </Box>
      <Box justifyContent="center">
        <Text color={theme.muted} dimColor={theme.dimMuted}>
          to view details
        </Text>
      </Box>
    </Box>
  );
};
