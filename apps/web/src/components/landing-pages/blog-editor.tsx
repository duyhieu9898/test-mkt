'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef } from 'react';
import { Bold, Italic, Heading1, Heading2, Heading3, List, ListOrdered, Quote, ImageIcon, Undo2, Redo2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';

interface Props {
  companyId: string;
  initialContent?: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function BlogEditor({ companyId, initialContent, onChange, placeholder }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const token = useAuthStore((s) => s.token);

  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: placeholder || 'Write your story…' })],
    content: initialContent || '',
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'prose prose-invert max-w-none focus:outline-none min-h-[400px] px-4 py-3 text-neutral-100' },
    },
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  });

  useEffect(() => {
    if (editor && initialContent !== undefined && editor.getHTML() !== initialContent) {
      editor.commands.setContent(initialContent || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) return null;

  const uploadImage = async (file: File) => {
    if (!token) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch(`${API_URL}/assets-library/company/${companyId}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json?.data?.url) throw new Error('Upload failed');
      editor.chain().focus().insertContent(`<img src="${json.data.url}" alt="" />`).run();
    } catch {
      toast.error('Could not upload image');
    }
  };

  const Btn = ({ on, active, title, children }: { on: () => void; active?: boolean; title: string; children: React.ReactNode }) => (
    <button type="button" onClick={on} title={title} className={`p-2 rounded hover:bg-neutral-800 ${active ? 'bg-neutral-800 text-blue-400' : 'text-neutral-300'}`}>
      {children}
    </button>
  );
  const Sep = () => <div className="w-px h-6 bg-neutral-800 mx-1" />;
  const c = editor.chain().focus();

  return (
    <div className="border border-neutral-800 rounded-lg bg-neutral-950 overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 p-2 border-b border-neutral-800 bg-neutral-900">
        <Btn on={() => c.toggleBold().run()} active={editor.isActive('bold')} title="Bold"><Bold className="w-4 h-4" /></Btn>
        <Btn on={() => c.toggleItalic().run()} active={editor.isActive('italic')} title="Italic"><Italic className="w-4 h-4" /></Btn>
        <Sep />
        <Btn on={() => c.toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="H1"><Heading1 className="w-4 h-4" /></Btn>
        <Btn on={() => c.toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="H2"><Heading2 className="w-4 h-4" /></Btn>
        <Btn on={() => c.toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="H3"><Heading3 className="w-4 h-4" /></Btn>
        <Sep />
        <Btn on={() => c.toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list"><List className="w-4 h-4" /></Btn>
        <Btn on={() => c.toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list"><ListOrdered className="w-4 h-4" /></Btn>
        <Btn on={() => c.toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Quote"><Quote className="w-4 h-4" /></Btn>
        <Sep />
        <Btn on={() => fileRef.current?.click()} title="Insert image"><ImageIcon className="w-4 h-4" /></Btn>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ''; }} />
        <div className="ml-auto flex items-center gap-1">
          <Btn on={() => c.undo().run()} title="Undo"><Undo2 className="w-4 h-4" /></Btn>
          <Btn on={() => c.redo().run()} title="Redo"><Redo2 className="w-4 h-4" /></Btn>
        </div>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
