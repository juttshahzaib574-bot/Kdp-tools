// Front/back matter: the pages every real published book has around the
// content itself (title page, copyright page, dedication, about-the-author,
// review request) — previously entirely absent from the rendered PDF, which
// meant the "book" was really just the puzzle with no cover-adjacent
// context. Each page here is genuinely optional and user-editable, not a
// fixed template forced into the output.

export interface BookMatterOptions {
  authorName: string;
  subtitle?: string;
  copyrightHolder?: string;
  /** Defaults to the current year at render time. */
  copyrightYear?: number;
  includeTitlePage: boolean;
  includeCopyrightPage: boolean;
  includeHowToSolvePage: boolean;
  includeReviewRequestPage: boolean;
}

export const DEFAULT_MATTER_TOGGLES: Pick<
  BookMatterOptions,
  "includeTitlePage" | "includeCopyrightPage" | "includeHowToSolvePage" | "includeReviewRequestPage"
> = {
  includeTitlePage: true,
  includeCopyrightPage: true,
  includeHowToSolvePage: true,
  includeReviewRequestPage: true,
};

export function copyrightNoticeText(options: BookMatterOptions): string {
  const year = options.copyrightYear ?? new Date().getFullYear();
  const holder = options.copyrightHolder?.trim() || options.authorName;
  return `Copyright © ${year} ${holder}. All rights reserved.`;
}

export const COPYRIGHT_BOILERPLATE =
  "No part of this publication may be reproduced, distributed, or transmitted in any form or by any means, including photocopying, recording, or other electronic or mechanical methods, without the prior written permission of the copyright holder, except in the case of brief quotations.";

export const HOW_TO_SOLVE_PARAGRAPHS = [
  "This is a logic grid puzzle: every clue is a true statement, and there is exactly one way to seat every suspect that satisfies all of them at once.",
  "Each suspect occupies exactly one seat — one per row, one per column. A seat is marked with a dot; a numbered square is a landmark referenced by a clue.",
  "Work through the clues in order. Some pin a suspect directly to a row, column, or room. Others describe a suspect's position relative to another suspect or a landmark — use those to rule seats in or out.",
  "There's no guessing required: every seat can be logically determined from the clues alone. If you find yourself guessing, re-read the clues you've already used — one of them rules out more than it first seems to.",
];

export function reviewRequestParagraph(title: string): string {
  return `If you enjoyed solving "${title}", a short review helps other puzzle readers find this book — and helps an independent author keep making more of them. Thank you for reading.`;
}
