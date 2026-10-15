# @kit/outline

Blender-Workbench-style outlines for three.js / React Three Fiber.

```tsx
markOutlined(mesh)                    // plain object
markOutlined(lootGroup, 'loot')       // + a coloured highlight
<Canvas>
  …your scene…
  <OutlinePass />                     {/* last child: it draws after everything else */}
</Canvas>
```

How it works: each registered mesh carries a material id (object/instance in RG, part in BA of an RGBA8 buffer).
`OutlinePass` renders that buffer on its own layer from `onBeforeRender` and then darkens a pixel by a fixed
amount for each of its four neighbours that belongs to a different id. Parts of one merged mesh get their own
lines through a `_PART_ID` attribute, if the geometry carries one.

- Lines fade out with the scene's fog (`OUTLINE.fogFade`) and are measured in CSS pixels (`OUTLINE.thickness`).
- A highlight tint draws a thicker coloured line instead of the dark one — for loot, chests, quest items.
- Taken from Cubocalypse without its crowd skinning; Овечья фабрика uses only the `hover` tint, round what the pointer
  is over (`<OutlinePass world={false} />`).

Requires WebGL2 (the id buffer is an integer-safe RGBA8 target) and a scene that renders through R3F.
