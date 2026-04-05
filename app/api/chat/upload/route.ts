import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File;

  if (!file) return Response.json({ error: "No file" }, { status: 400 });

  const ext = file.name.split(".").pop();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from("chat-files")
    .upload(path, file, { contentType: file.type });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(path);

  return Response.json({
    ok: true,
    url: urlData.publicUrl,
    type: file.type,
    name: file.name,
  });
}
