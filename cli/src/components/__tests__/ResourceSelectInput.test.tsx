// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { PassThrough } from "node:stream";
import { Box, render, renderToString, Text } from "ink";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { getListRowFromMouseY } from "../../utils/terminal-layout.js";
import { ResourceSelectInput } from "../ResourceSelectInput.js";

const ANSI_SGR = new RegExp([String.fromCharCode(0x1b), "\\[[0-?]*[ -/]*[@-~]"].join(""), "g");

function createStreams(columns: number) {
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdin, {
    isTTY: true,
    isRaw: false,
    setRawMode: () => {},
  });

  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { isTTY: true, columns, rows: 24 });

  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stderr, { isTTY: true, columns, rows: 24 });

  return { stdin, stdout, stderr };
}

describe("ResourceSelectInput layout measurement", () => {
  it("reports its measured top row for mouse-to-list row mapping", async () => {
    const streams = createStreams(80);
    const measuredTops: number[] = [];
    const app = render(
      <Box flexDirection="column">
        <Text>heading</Text>
        <Text>tabs</Text>
        <Text>separator</Text>
        <ResourceSelectInput
          items={[{ value: "api", label: "shop-api" }]}
          onSelect={() => {}}
          highlightedIndex={0}
          width={80}
          onLayout={(top) => measuredTops.push(top)}
        />
      </Box>,
      {
        ...streams,
        alternateScreen: true,
        exitOnCtrlC: false,
        patchConsole: false,
      },
    );

    try {
      await app.waitUntilRenderFlush();
      expect(measuredTops.at(-1)).toBe(3);
      const listTop = measuredTops.at(-1) ?? Number.NaN;
      expect(getListRowFromMouseY(listTop + 1, listTop)).toBe(0);
    } finally {
      app.unmount();
      streams.stdin.destroy();
      streams.stdout.destroy();
      streams.stderr.destroy();
    }
  });

  it("keeps long resource labels on one terminal row", () => {
    const width = 20;
    const output = renderToString(
      <ResourceSelectInput
        items={[
          { value: "first", label: "a-resource-label-that-is-longer-than-the-terminal" },
          { value: "second", label: "another-long-resource-label" },
        ]}
        onSelect={() => {}}
        highlightedIndex={0}
        width={width}
      />,
      { columns: width },
    ).replace(ANSI_SGR, "");
    const rows = output.split(/\r?\n/).filter((line) => line.length > 0);

    expect(rows).toHaveLength(2);
    expect(rows.every((line) => Array.from(line).length <= width)).toBe(true);
  });
});

it("keeps controlled selection after a same-length list refresh", async () => {
  const streams = createStreams(80);
  Object.assign(streams.stdin, { ref: () => {}, unref: () => {} });
  const selected: string[] = [];
  const items = (prefix: string) =>
    [0, 1, 2].map((i) => ({ value: `${prefix}-${i}`, label: `${prefix}-${i}` }));
  const onSelect = (item: { value: string }) => selected.push(item.value);
  const app = render(
    <ResourceSelectInput
      items={items("old")}
      onSelect={onSelect}
      highlightedIndex={2}
      width={80}
    />,
    { ...streams, exitOnCtrlC: false, patchConsole: false },
  );
  try {
    await app.waitUntilRenderFlush();
    app.rerender(
      <ResourceSelectInput
        items={items("new")}
        onSelect={onSelect}
        highlightedIndex={2}
        width={80}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    await app.waitUntilRenderFlush();
    streams.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(selected).toEqual(["new-2"]);
  } finally {
    app.unmount();
    streams.stdin.destroy();
    streams.stdout.destroy();
    streams.stderr.destroy();
  }
});

async function pressEnterAfter(
  first: ReactElement,
  second: ReactElement | undefined,
): Promise<void> {
  const streams = createStreams(80);
  Object.assign(streams.stdin, { ref: () => {}, unref: () => {} });
  const app = render(first, { ...streams, exitOnCtrlC: false, patchConsole: false });
  try {
    await app.waitUntilRenderFlush();
    if (second) {
      app.rerender(second);
      await new Promise((resolve) => setTimeout(resolve, 30));
      await app.waitUntilRenderFlush();
    }
    streams.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 30));
  } finally {
    app.unmount();
    streams.stdin.destroy();
    streams.stdout.destroy();
    streams.stderr.destroy();
  }
}

it("does not call onSelect when Enter is pressed on an empty list", async () => {
  const selected: string[] = [];
  await pressEnterAfter(
    <ResourceSelectInput
      items={[]}
      onSelect={(item) => selected.push(item.value)}
      highlightedIndex={0}
      width={80}
    />,
    undefined,
  );
  expect(selected).toEqual([]);
});

it("clamps the selection when the list shrinks before Enter", async () => {
  const selected: string[] = [];
  const onSelect = (item: { value: string }) => selected.push(item.value);
  const items = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ value: `item-${i}`, label: `item-${i}` }));
  await pressEnterAfter(
    <ResourceSelectInput items={items(3)} onSelect={onSelect} highlightedIndex={2} width={80} />,
    <ResourceSelectInput items={items(1)} onSelect={onSelect} highlightedIndex={2} width={80} />,
  );
  expect(selected).toEqual(["item-0"]);
});
