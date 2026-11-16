export const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
