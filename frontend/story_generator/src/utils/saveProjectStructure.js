import { projectApi, batchApi } from '../services/api';

/**
 * Persists folder order on the project and file order within each folder.
 */
export async function saveProjectStructure(projectId, projectToSave) {
  const folderIds = projectToSave.folders.map((f) => f._id);
  await projectApi.update(projectId, { folderIds });

  const folderUpdates = projectToSave.folders.map((folder) => ({
    type: 'updateFolder',
    folderId: folder._id,
    updates: {
      fileIds: folder.files.map((f) => f._id),
    },
  }));

  if (folderUpdates.length > 0) {
    await batchApi.update(folderUpdates);
  }
}
