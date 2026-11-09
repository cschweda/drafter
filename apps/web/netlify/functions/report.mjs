// Report a problem / Suggest an idea, by email: drafter.dev's Netlify Function (../report.mjs has
// it all, and test/report-function.test.ts runs it). Reached at /.netlify/functions/report.
import { createReportHandler } from '../report.mjs';

export default createReportHandler();
