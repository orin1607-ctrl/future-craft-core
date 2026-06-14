import { useState, useRef } from 'react';
import { Camera, X, Loader2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { buildStoragePath } from '@/lib/storage';
import { DocumentPreviewDialog } from '@/components/documents/DocumentViewer';
import { fileNameFromDocument } from '@/lib/documentDisplayUtils';

interface MultiImageUploadProps {
  label: string;
  required?: boolean;
  imageUrls: string[];
  onImagesChanged: (urls: string[]) => void;
  folder: string;
  max?: number;
}

export default function MultiImageUpload({ label, required, imageUrls, onImagesChanged, folder, max = 10 }: MultiImageUploadProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ url: string; fileName: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    e.target.value = '';

    setUploading(true);
    const path = buildStoragePath(user.id, folder, file.name);

    const { error } = await supabase.storage.from('documents').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) {
      console.error('Upload error:', error);
      alert('שגיאה בהעלאת התמונה: ' + error.message);
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path);
    onImagesChanged([...imageUrls, publicUrl]);
    setUploading(false);
  };

  const removeImage = (index: number) => {
    onImagesChanged(imageUrls.filter((_, i) => i !== index));
  };

  return (
    <div className="card-elevated">
      <h2 className="text-lg font-bold mb-4 text-primary">
        {label} {required && <span className="text-destructive">(חובה)</span>}
      </h2>

      {imageUrls.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {imageUrls.map((url, i) => (
            <div key={i} className="relative">
              <button
                type="button"
                onClick={() => setPreview({ url, fileName: fileNameFromDocument(url, `${label} ${i + 1}`) })}
                className="block w-full rounded-xl overflow-hidden h-36 focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <img src={url} alt={`${label} ${i + 1}`} className="w-full h-full object-cover" />
              </button>
              <button
                onClick={() => removeImage(i)}
                className="absolute top-1.5 left-1.5 p-1.5 rounded-full bg-destructive text-destructive-foreground"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {imageUrls.length < max && (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-3 py-5 rounded-xl border-2 border-dashed border-input bg-muted/50 text-lg font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <><Loader2 size={24} className="animate-spin" /> מעלה...</>
          ) : (
            <>{imageUrls.length === 0 ? <Camera size={24} /> : <Plus size={24} />} {imageUrls.length === 0 ? '📸 צלם / בחר תמונה' : 'הוסף תמונה'}</>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      <DocumentPreviewDialog
        open={!!preview}
        url={preview?.url ?? null}
        fileName={preview?.fileName}
        onOpenChange={(open) => { if (!open) setPreview(null); }}
      />
    </div>
  );
}
