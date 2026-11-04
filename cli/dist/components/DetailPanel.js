import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { Box, Text } from "ink";
import { formatAge } from "../utils/agent-format.js";
import { formatDate, getStatusColor, getStatusIcon } from "../utils/formatting.js";
import { getTUIStatusColor, getTUIStatusIcon, useTUITheme } from "./ui-theme.js";
const MAX_LISTED_SESSIONS = 5;
/** Readiness, session count, last activity and the newest sessions of an agent; `null` while the first poll is pending. */
const AgentSection = ({ agent }) => {
    const theme = useTUITheme();
    const row = (label, value, color = theme.foreground) => (_jsxs(Box, { children: [_jsxs(Text, { color: theme.muted, children: [label, ": "] }), _jsx(Text, { color: color, children: value })] }));
    let body;
    if (agent === null) {
        body = row("Agent", "checking...", theme.muted);
    }
    else if (agent.state === "not-running") {
        body = row("Agent", "not running", theme.warning);
    }
    else {
        const { sessions } = agent;
        const newest = sessions?.sessions[0]?.lastActivity ?? null;
        body = (_jsxs(_Fragment, { children: [row("Ready", agent.ready ? "yes" : "no", agent.ready ? theme.success : theme.warning), sessions ? (_jsxs(_Fragment, { children: [row("Sessions", String(sessions.total)), row("Last activity", formatAge(newest)), sessions.sessions.slice(0, MAX_LISTED_SESSIONS).map((s) => (_jsxs(Box, { children: [_jsx(Text, { color: theme.foreground, children: s.sessionId.slice(0, 18) }), _jsxs(Text, { color: theme.muted, children: [" ", formatAge(s.lastActivity), " ", s.status] })] }, s.sessionId))), sessions.total > MAX_LISTED_SESSIONS && (_jsxs(Text, { color: theme.muted, children: ["... ", sessions.total - MAX_LISTED_SESSIONS, " more"] }))] })) : (row("Sessions", "not available (agent has no /sessions)", theme.muted))] }));
    }
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: theme.muted, underline: true, children: "Agent" }), body] }));
};
export const DetailPanel = ({ stack, service, stackMetadata, agent, visible, }) => {
    const theme = useTUITheme();
    if (!visible) {
        return _jsx(Box, { width: 0 });
    }
    if (service) {
        const title = theme.ascii
            ? `--- ${service.name.toUpperCase()} ---`
            : `\u250C\u2500 ${service.name.toUpperCase()} \u2500\u2510`;
        return (_jsxs(Box, { width: 40, flexDirection: "column", borderStyle: theme.ascii ? undefined : "single", borderColor: theme.border, paddingX: 1, paddingY: 1, children: [_jsx(Box, { marginBottom: 1, justifyContent: "center", children: _jsx(Text, { color: theme.accent, bold: true, children: title }) }), _jsxs(Box, { flexDirection: "column", marginY: 1, children: [_jsxs(Box, { children: [_jsx(Text, { color: theme.muted, children: "Name: " }), _jsx(Text, { color: theme.foreground, children: service.name })] }), _jsxs(Box, { children: [_jsx(Text, { color: theme.muted, children: "Stack: " }), _jsx(Text, { color: theme.foreground, children: service.stack || "unknown" })] }), _jsxs(Box, { children: [_jsx(Text, { color: theme.muted, children: "Type: " }), _jsx(Text, { color: theme.warning, bold: theme.highContrast, children: (service.stack || "") === "platform" ? "PLATFORM" : "PRODUCT" })] })] }), agent !== undefined && _jsx(AgentSection, { agent: agent }), _jsx(Box, { marginTop: 2, children: _jsxs(Text, { color: theme.muted, dimColor: theme.dimMuted, children: ["Press ", _jsx(Text, { color: theme.accent, children: "[Esc]" }), " to close"] }) })] }));
    }
    if (stack && stackMetadata) {
        const statusColor = getTUIStatusColor(theme, getStatusColor(stackMetadata.overallStatus));
        const statusIcon = getTUIStatusIcon(theme, getStatusIcon(stackMetadata.overallStatus), getStatusColor(stackMetadata.overallStatus));
        const title = theme.ascii
            ? `--- ${stack.name.toUpperCase()} ---`
            : `\u250C\u2500 ${stack.name.toUpperCase()} \u2500\u2510`;
        return (_jsxs(Box, { width: 40, flexDirection: "column", borderStyle: theme.ascii ? undefined : "single", borderColor: theme.border, paddingX: 1, paddingY: 1, children: [_jsx(Box, { marginBottom: 1, justifyContent: "center", children: _jsx(Text, { color: theme.accent, bold: true, children: title }) }), _jsx(Box, { borderStyle: theme.ascii ? undefined : "single", borderColor: statusColor, paddingX: 1, paddingY: 1, marginY: 1, justifyContent: "center", children: _jsxs(Text, { color: statusColor, bold: true, children: [statusIcon, " ", stackMetadata.overallStatus.toUpperCase()] }) }), _jsxs(Box, { flexDirection: "column", marginY: 1, children: [_jsxs(Box, { children: [_jsx(Text, { color: theme.muted, children: "Created: " }), _jsx(Text, { color: theme.foreground, children: formatDate(stackMetadata.createdAt) })] }), _jsxs(Box, { children: [_jsx(Text, { color: theme.muted, children: "Resources: " }), _jsx(Text, { color: theme.accent, bold: theme.highContrast, children: stackMetadata.resourceCount })] })] }), _jsx(Box, { marginTop: 1, marginBottom: 1, children: _jsx(Text, { color: theme.muted, underline: true, children: "Resources" }) }), _jsx(Box, { flexDirection: "column", children: stack.resources.map((svc, index) => (_jsxs(Box, { children: [_jsx(Text, { color: theme.muted, children: theme.ascii
                                    ? index === stack.resources.length - 1
                                        ? "L- "
                                        : "|- "
                                    : index === stack.resources.length - 1
                                        ? "\u2514\u2500 "
                                        : "\u251C\u2500 " }), _jsx(Text, { color: theme.foreground, children: svc.name })] }, svc.name))) }), _jsx(Box, { marginTop: 2, children: _jsxs(Text, { color: theme.muted, dimColor: theme.dimMuted, children: ["Press ", _jsx(Text, { color: theme.accent, children: "[Esc]" }), " to close"] }) })] }));
    }
    return (_jsxs(Box, { width: 40, borderStyle: theme.ascii ? undefined : "single", borderColor: theme.border, paddingX: 2, paddingY: 2, flexDirection: "column", children: [_jsx(Box, { marginBottom: 1, justifyContent: "center", children: _jsx(Text, { color: theme.muted, dimColor: theme.dimMuted, children: "Select a stack or service" }) }), _jsx(Box, { justifyContent: "center", children: _jsx(Text, { color: theme.muted, dimColor: theme.dimMuted, children: "to view details" }) })] }));
};
