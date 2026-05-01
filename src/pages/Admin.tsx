import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Upload,
  LogOut,
  Eye,
  Pencil,
  Download,
  CheckCircle2,
  XCircle,
  X,
  Loader2,
  FileText,
} from 'lucide-react';
import mammoth from 'mammoth';
import { toast } from 'sonner';
import { DocxView } from '@/components/DocxView';

interface DocRow {
  id: string;
  file_name: string;
  file_url: string;
  html_content: string;
  is_published: boolean;
  updated_at: string;
}

export default function Admin() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [doc, setDoc] = useState<DocRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editHtml, setEditHtml] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Auth guard
  useEffect(() => {
    document.title = 'Admin — Interesting Info';
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate('/admin/login', { replace: true });
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate('/admin/login', { replace: true });
      } else {
        setChecking(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const loadDoc = useCallback(async () => {
    const { data, error } = await supabase
      .from('published_document')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      return;
    }
    setDoc(data ?? null);
  }, []);

  useEffect(() => {
    if (!checking) loadDoc();
  }, [checking, loadDoc]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login', { replace: true });
  };

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      toast.error('Only .docx files are supported.');
      return;
    }
    setUploading(true);
    try {
      // Parse with mammoth in browser
      const arrayBuffer = await file.arrayBuffer();
      const { value: html } = await mammoth.convertToHtml({ arrayBuffer });

      // Upload to storage (overwrite stable filename to avoid orphans)
      const path = `current/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(path, file, {
          contentType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          upsert: true,
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from('documents').getPublicUrl(path);

      // Upsert single row
      if (doc) {
        // Try cleaning up old file (best effort)
        try {
          const oldPath = doc.file_url.split('/documents/')[1];
          if (oldPath) await supabase.storage.from('documents').remove([oldPath]);
        } catch {
          /* ignore */
        }

        const { error } = await supabase
          .from('published_document')
          .update({
            file_name: file.name,
            file_url: pub.publicUrl,
            html_content: html,
            is_published: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', doc.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('published_document').insert({
          file_name: file.name,
          file_url: pub.publicUrl,
          html_content: html,
          is_published: false,
        });
        if (error) throw error;
      }

      toast.success('Document uploaded');
      await loadDoc();
    } catch (e: any) {
      toast.error(e.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const togglePublish = async () => {
    if (!doc) return;
    setBusy(true);
    const { error } = await supabase
      .from('published_document')
      .update({ is_published: !doc.is_published, updated_at: new Date().toISOString() })
      .eq('id', doc.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(doc.is_published ? 'Unpublished' : 'Published');
    loadDoc();
  };

  const openEdit = () => {
    if (!doc) return;
    setEditHtml(doc.html_content);
    setEditOpen(true);
  };

  const saveEdits = async () => {
    if (!doc || !editorRef.current) return;
    const newHtml = editorRef.current.innerHTML;
    setBusy(true);
    const { error } = await supabase
      .from('published_document')
      .update({ html_content: newHtml, updated_at: new Date().toISOString() })
      .eq('id', doc.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Edits saved');
    setEditOpen(false);
    loadDoc();
  };

  const downloadOriginal = async () => {
    if (!doc) return;
    try {
      const res = await fetch(doc.file_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error('Download failed');
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--admin-bg))]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--admin-bg))]">
      {/* Top nav */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="font-semibold text-sm">Interesting Info Admin</span>
          </div>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-8 space-y-8">
        {/* Upload */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            Upload document
          </h2>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            className={`block bg-card border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-primary bg-accent' : 'border-border hover:bg-accent'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
            />
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              {uploading ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-sm">Uploading & parsing…</span>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6" />
                  <span className="text-sm">
                    <span className="text-foreground font-medium">Drag & drop</span> a .docx
                    file, or click to choose
                  </span>
                </>
              )}
            </div>
          </label>
        </section>

        {/* Document */}
        {doc && (
          <>
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Actions
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={busy}
                  onClick={togglePublish}
                  className={`inline-flex items-center justify-center sm:justify-start gap-2 h-10 px-4 rounded-lg text-sm font-medium text-primary-foreground min-w-[120px] disabled:opacity-60 ${
                    doc.is_published
                      ? 'bg-destructive hover:opacity-90'
                      : 'bg-[hsl(var(--success))] hover:opacity-90'
                  }`}
                >
                  {doc.is_published ? (
                    <>
                      <XCircle className="h-4 w-4" /> Unpublish
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> Publish
                    </>
                  )}
                </button>
                <button
                  onClick={() => setPreviewOpen(true)}
                  className="inline-flex items-center justify-center sm:justify-start gap-2 h-10 px-4 rounded-lg text-sm font-medium bg-card border border-border hover:bg-accent min-w-[120px]"
                >
                  <Eye className="h-4 w-4" /> Preview
                </button>
                <button
                  onClick={openEdit}
                  className="inline-flex items-center justify-center sm:justify-start gap-2 h-10 px-4 rounded-lg text-sm font-medium bg-card border border-border hover:bg-accent min-w-[120px]"
                >
                  <Pencil className="h-4 w-4" /> Edit
                </button>
                <button
                  onClick={downloadOriginal}
                  className="inline-flex items-center justify-center sm:justify-start gap-2 h-10 px-4 rounded-lg text-sm font-medium bg-card border border-border hover:bg-accent min-w-[120px]"
                >
                  <Download className="h-4 w-4" /> Download
                </button>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Status
              </h2>
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-medium text-sm break-all">{doc.file_name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Updated {new Date(doc.updated_at).toLocaleString()}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      doc.is_published
                        ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {doc.is_published ? 'Published' : 'Unpublished'}
                  </span>
                </div>
                <div
                  className="mt-4 text-sm text-muted-foreground line-clamp-4 border-t border-border pt-3"
                  // strip html for preview snippet
                >
                  {stripHtml(doc.html_content).slice(0, 240)}
                  {stripHtml(doc.html_content).length > 240 ? '…' : ''}
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Preview modal */}
      {previewOpen && doc && (
        <Modal title="Preview" onClose={() => setPreviewOpen(false)}>
          <div className="bg-background">
            <DocxView fileUrl={doc.file_url} />
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editOpen && doc && (
        <Modal title="Edit document" onClose={() => setEditOpen(false)}>
          <div className="p-5 sm:p-8">
            <div className="mx-auto max-w-[780px] mb-4 text-xs text-muted-foreground bg-muted border border-border rounded-lg px-3 py-2">
              Editing converts the document to HTML and may lose some advanced Word formatting (custom colors, highlights, fonts, spacing). The original .docx file is preserved for the public view.
            </div>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="doc-prose mx-auto max-w-[780px] min-h-[300px] max-h-[50vh] overflow-y-auto outline-none focus:ring-2 focus:ring-ring rounded-lg p-4 bg-background border border-border"
              dangerouslySetInnerHTML={{ __html: editHtml }}
            />
            <div className="mx-auto max-w-[780px] mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEditOpen(false)}
                className="h-10 px-4 rounded-lg text-sm font-medium bg-card border border-border hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={saveEdits}
                disabled={busy}
                className="h-10 px-4 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                Save edits
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function stripHtml(html: string) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 bg-black/50 overflow-hidden">
      <div className="bg-card text-card-foreground sm:border border-border rounded-none sm:rounded-2xl w-full h-full sm:h-auto max-w-3xl max-h-[100dvh] sm:max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-auto">{children}</div>
      </div>
    </div>
  );
}
