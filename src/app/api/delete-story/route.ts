import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Story ID is required" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    // The Service Role Key gives this specific API route VIP access to delete the story securely
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; 
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error } = await supabase
      .from('stories')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Delete Story Error:", error);
    return NextResponse.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
  }
}