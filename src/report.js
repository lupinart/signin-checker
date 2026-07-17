export function summarizeIssues(issues) {
  return issues.reduce((summary, issue) => {
    if (issue.severity in summary) summary[issue.severity] += 1;
    return summary;
  }, { error: 0, review: 0, tip: 0 });
}
