export const buildIssueListUrl = (projectIdentifier: string, categoryId: number): string => {
  const params = new URLSearchParams();
  params.set('set_filter', '1');
  params.set('f[]', 'category_id');
  params.set('op[category_id]', '=');
  params.set('v[category_id][]', String(categoryId));
  return `/projects/${projectIdentifier}/issues?${params.toString()}`;
};
