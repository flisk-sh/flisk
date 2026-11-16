/**
 * Resolves `flisk help <cmd> [sub...]` across nested subcommands, stopping at the first option flag.
 */
export function resolveHelpTarget(args, commands) {
    if (args[0] !== "help")
        return { depth: 0 };
    const targets = [];
    for (const arg of args.slice(1)) {
        if (arg.startsWith("-"))
            break;
        targets.push(arg);
    }
    if (targets.length === 0)
        return { depth: 0 };
    let pool = commands;
    let current;
    for (const target of targets) {
        const match = pool.find((command) => command.name() === target || command.aliases().includes(target));
        if (!match)
            return { unknown: target, depth: targets.length };
        current = match;
        pool = match.commands;
    }
    return { command: current, depth: targets.length };
}
/**
 * `flisk help <name>` (and nested `flisk help <cmd> <sub>`) should fail for a name that is not a
 * command or alias, like `flisk <name>` does. Returns the unknown name, or undefined when the
 * arguments are not `help <name>` or every path word resolves to a known command/subcommand.
 */
export function unknownHelpTarget(args, commands) {
    return resolveHelpTarget(args, commands).unknown;
}
