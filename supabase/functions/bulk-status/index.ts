import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
};

interface BulkRequest {
  ids: number[];
  status: "approved" | "rejected";
}

interface Report {
  id: number;
  nama: string;
  deskripsi: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "PATCH") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: BulkRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { ids, status } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return new Response(JSON.stringify({ error: "ids array is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (ids.length > 100) {
    return new Response(JSON.stringify({ error: "Max 100 ids per request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (status !== "approved" && status !== "rejected") {
    return new Response(JSON.stringify({ error: "status must be 'approved' or 'rejected'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Teruskan token frontend; RLS di database yang menegakkan aturan
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const apikey = req.headers.get("apikey") ?? "";

  // Deduplicate ids
  const uniqueIds = [...new Set(ids)];

  // Update only pending rows, return updated rows
  const query = `${Deno.env.get("SUPABASE_URL")}/rest/v1/reports?id=in.(${uniqueIds.join(",")})&status=eq.pending&select=id,nama,deskripsi,status,created_at,updated_at`;

  const updateRes = await fetch(query, {
    method: "PATCH",
    headers: {
      "apikey": apikey,
      "Authorization": auth,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
  });

  if (!updateRes.ok) {
    const err = await updateRes.text();
    return new Response(JSON.stringify({ error: "Update failed", detail: err }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const updated: Report[] = await updateRes.json();
  const updatedById = new Map(updated.map((r) => [r.id, r]));

  // Build skipped list
  const skipped: { id: number; reason: string }[] = [];
  
  // Check which IDs were not updated
  const missing = uniqueIds.filter((id) => !updatedById.has(id));
  
  if (missing.length > 0) {
    // Check which are not found vs which are already final
    const checkQuery = `${Deno.env.get("SUPABASE_URL")}/rest/v1/reports?id=in.(${missing.join(",")})&select=id,status`;
    const checkRes = await fetch(checkQuery, {
      headers: {
        "apikey": apikey,
        "Authorization": auth,
      },
    });
    
    if (checkRes.ok) {
      const existing: Report[] = await checkRes.json();
      const existingIds = new Set(existing.map((r) => r.id));
      
      for (const id of uniqueIds) {
        if (updatedById.has(id)) continue;
        if (existingIds.has(id)) {
          skipped.push({ id, reason: "sudah diputuskan" });
        } else {
          skipped.push({ id, reason: "tidak ditemukan" });
        }
      }
    } else {
      // Fallback: assume all missing are "sudah diputuskan"
      for (const id of missing) {
        skipped.push({ id, reason: "sudah diputuskan" });
      }
    }
  }

  // Sort updated to match original ids order
  updated.sort((a, b) => uniqueIds.indexOf(a.id) - uniqueIds.indexOf(b.id));

  return new Response(JSON.stringify({ updated, skipped }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});