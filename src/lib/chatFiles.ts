"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Chat photos and voice messages are private, so they are opened with signed links.
// Links are kept for the visit so each file is asked for once.
const urls = new Map<string, Promise<string | null>>();

export function useSignedUrl(path: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!urls.has(path)) {
      urls.set(
        path,
        supabase.storage.from("chat").createSignedUrl(path, 60 * 60 * 24).then(({ data }) => data?.signedUrl ?? null),
      );
    }
    let live = true;
    urls.get(path)!.then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [path]);
  return url;
}

export async function uploadChatFile(familyId: string, file: Blob, extension: string, contentType: string) {
  const path = `${familyId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("chat").upload(path, file, { contentType });
  if (error) throw error;
  return path;
}
