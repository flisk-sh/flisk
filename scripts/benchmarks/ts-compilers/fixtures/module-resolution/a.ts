import { b } from "./b.js";
import { c } from "./b";
import data from "./data.json" with { type: "json" };
import fs from "node:fs";
export const x: number = b + data.k;
export const y: string = x;
