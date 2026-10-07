import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Card } from "@workspace/api-client-react";
import { PocketSurface } from "./three-binder-viewer";

// tsx uses classic JSX for this project's preserve-JSX configuration;
// Vite uses the automatic runtime in the application.
test("empty and filled light sleeves retain their gradient over an opaque paper base", () => {
  const previous = Reflect.get(globalThis, "React");
  Object.assign(globalThis, { React });
  try {
    const cards = [
      undefined,
      { name: "Test card", imageUrl: "https://example.test/card.jpg" } as Card,
      { name: "Missing artwork", imageUrl: null } as unknown as Card,
    ];
    for (const card of cards) {
      const markup = renderToStaticMarkup(React.createElement(PocketSurface, {
        slot: 0, card, selected: true, lightSurface: true,
      }));
      assert.match(markup, /style="background-color:#ece6d9"/);
      assert.match(markup, /bg-gradient-to-br/);
      assert.match(markup, /outline-amber-200/);
      assert.match(markup, /border-t/);
      if (!card) assert.match(markup, /Empty slot/);
      else if (card.imageUrl) assert.match(markup, /<img[^>]*src="https:\/\/example.test\/card.jpg"/);
      else assert.match(markup, /Artwork unavailable/);
    }
    const dark = renderToStaticMarkup(React.createElement(PocketSurface, {
      slot: 0, selected: false, lightSurface: false,
    }));
    assert.doesNotMatch(dark, /background-color:#ece6d9/);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globalThis, "React");
    else Reflect.set(globalThis, "React", previous);
  }
});
