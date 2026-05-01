
-- Table
CREATE TABLE public.published_document (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  html_content TEXT NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.published_document ENABLE ROW LEVEL SECURITY;

-- Public can read only published rows
CREATE POLICY "Public can view published document"
ON public.published_document
FOR SELECT
USING (is_published = true);

-- Authenticated (admin) can do everything
CREATE POLICY "Authenticated can view all"
ON public.published_document
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated can insert"
ON public.published_document
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated can update"
ON public.published_document
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated can delete"
ON public.published_document
FOR DELETE
TO authenticated
USING (true);

-- Storage bucket for documents (public so file_url works without signing)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true);

-- Storage policies
CREATE POLICY "Public can read documents bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'documents');

CREATE POLICY "Authenticated can upload to documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Authenticated can update documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'documents');

CREATE POLICY "Authenticated can delete documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'documents');
