export function summarizeIssues(issues) {
  return issues.reduce((summary, issue) => {
    if (issue.severity in summary) summary[issue.severity] += 1;
    return summary;
  }, { error: 0, review: 0, tip: 0 });
}

export function buildAnonymousReport({ profile, result }) {
  return {
    generatedAt: new Date().toISOString(),
    privacy: "本報告不含原始文件、照片、OCR 文字或個人欄位。",
    profile: {
      planName: profile.planName,
      planNumber: profile.planNumber,
      version: profile.version ?? 1
    },
    summary: summarizeIssues(result.issues),
    calculated: result.calculated,
    issues: result.issues.map(({ code, severity, message, entryIds = [], field = "" }) => ({
      code, severity, message, entryIds, field
    })),
    declarations: result.declarations.map(({ code, label }) => ({ code, label }))
  };
}
