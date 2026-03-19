import type { Databases } from 'node-appwrite';

export async function getDocumentOrNull(
  databases: Databases,
  databaseId: string,
  collectionId: string,
  documentId: string,
): Promise<Record<string, unknown> | null> {
  try {
    return await databases.getDocument(databaseId, collectionId, documentId) as unknown as Record<string, unknown>;
  } catch (error) {
    const typed = error as { code?: number; type?: string };
    if (typed?.code === 404 || String(typed?.type ?? '').includes('not_found')) {
      return null;
    }

    throw error;
  }
}
