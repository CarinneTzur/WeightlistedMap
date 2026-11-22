export async function removeUserFolder(
	adminClient,
	bucket,
	prefix,
) {
 // Remove in batches without offsets, since each removal changes the listing.
 for (;;) {
  const { data, error } = await adminClient.storage.from(bucket).list(prefix, { limit: 100 });
  if (error) throw error;
  if (!data?.length) return;
  const files = [];
  for (const item of data) {
   const path = `${prefix}/${item.name}`;
   if (item.id) files.push(path);
   else await removeUserFolder(adminClient, bucket, path);
  }
  if (files.length) {
   const { error: removeError } = await adminClient.storage.from(bucket).remove(files);
   if (removeError) throw removeError;
  }
 }

}
