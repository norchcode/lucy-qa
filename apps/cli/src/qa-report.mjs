import { generateQaRunReport } from '../../../packages/qa-playwright/src/index.mjs';

export const runQaReportCommand = async ({ runDir }) => {
  return generateQaRunReport({ runDir });
};
