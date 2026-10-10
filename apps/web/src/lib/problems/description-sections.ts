/**
 * Three-section problem description stored in Problem.description (§13.2).
 * Serialize on save, parse on edit hydration.
 */

export const DESCRIPTION_SECTION_HEADERS = {
  problem: "## Problem",
  whatsBroken: "## What's broken",
  desiredOutput: "## Desired output",
} as const;

export type DescriptionSections = {
  description: string;
  whatsBroken: string;
  desiredOutput: string;
};

const ORDERED_SECTIONS: {
  key: keyof DescriptionSections;
  header: string;
}[] = [
  { key: "description", header: DESCRIPTION_SECTION_HEADERS.problem },
  { key: "whatsBroken", header: DESCRIPTION_SECTION_HEADERS.whatsBroken },
  { key: "desiredOutput", header: DESCRIPTION_SECTION_HEADERS.desiredOutput },
];

export function serializeDescription(sections: DescriptionSections): string {
  return ORDERED_SECTIONS.map(({ key, header }) => {
    const body = sections[key].trim();
    return body ? `${header}\n${body}` : "";
  })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Split a stored description blob into three fields. Legacy rows without
 * section headers land entirely in `description`; other fields stay empty.
 */
export function parseDescription(blob: string): DescriptionSections {
  const trimmed = blob.trim();
  if (!trimmed) {
    return { description: "", whatsBroken: "", desiredOutput: "" };
  }

  const hasAnyHeader = ORDERED_SECTIONS.some(({ header }) =>
    trimmed.includes(header)
  );
  if (!hasAnyHeader) {
    return { description: trimmed, whatsBroken: "", desiredOutput: "" };
  }

  const result: DescriptionSections = {
    description: "",
    whatsBroken: "",
    desiredOutput: "",
  };

  for (let i = 0; i < ORDERED_SECTIONS.length; i++) {
    const { key, header } = ORDERED_SECTIONS[i];
    const start = trimmed.indexOf(header);
    if (start === -1) continue;

    const contentStart = start + header.length;
    let contentEnd = trimmed.length;

    for (let j = i + 1; j < ORDERED_SECTIONS.length; j++) {
      const nextHeader = ORDERED_SECTIONS[j].header;
      const nextIndex = trimmed.indexOf(nextHeader, contentStart);
      if (nextIndex !== -1) {
        contentEnd = nextIndex;
        break;
      }
    }

    result[key] = trimmed.slice(contentStart, contentEnd).trim();
  }

  return result;
}
