// Resolve environment values at use time, including ~ in configured paths.
export const projectConfig = (home: string, root?: string, file?: string) => {
  const expand = (path: string) => path === '~' ? home : path.replace(/^~\//, `${home}/`)
  return { root: expand(root || `${home}/projects`), projectsFile: file ? expand(file) : undefined }
}

export const syncMessage = (
  phrase: string | undefined,
  project: { isCurrent: boolean; name: string; dir: string },
) => {
  const text = phrase || 'sync'
  return project.isCurrent ? text : `${text} — only project ${project.name} (${project.dir})`
}
