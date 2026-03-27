'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Plus,
  LayoutTemplate,
  AlertTriangle,
  Lightbulb,
  Grid3X3,
  MessageSquareQuote,
  CreditCard,
  HelpCircle,
  Megaphone,
  PanelBottom,
  Palette,
  Settings,
  Type,
} from 'lucide-react';
import { useEditorStore, selectSelectedBlock } from '@/stores/editor-store';
import { blockDefinitions, categoryOrder, categoryLabels } from '@1person/workflow/landing-pages/blocks';
import type { BlockType } from '@1person/workflow/landing-pages/blocks';
import { cn } from '@/lib/utils';

const iconMap: Record<string, React.ReactNode> = {
  'layout-template': <LayoutTemplate className="w-5 h-5" />,
  'alert-triangle': <AlertTriangle className="w-5 h-5" />,
  lightbulb: <Lightbulb className="w-5 h-5" />,
  'grid-3x3': <Grid3X3 className="w-5 h-5" />,
  'message-square-quote': <MessageSquareQuote className="w-5 h-5" />,
  'credit-card': <CreditCard className="w-5 h-5" />,
  'help-circle': <HelpCircle className="w-5 h-5" />,
  megaphone: <Megaphone className="w-5 h-5" />,
  'panel-bottom': <PanelBottom className="w-5 h-5" />,
};

interface EditorSidebarProps {
  primaryColor: string;
  onPrimaryColorChange: (color: string) => void;
}

export function EditorSidebar({ primaryColor, onPrimaryColorChange }: EditorSidebarProps) {
  const { addBlock, selectedBlockId, updateBlockContent, isPreviewing } = useEditorStore();
  const selectedBlock = useEditorStore(selectSelectedBlock);
  const [activeTab, setActiveTab] = useState('blocks');

  const handleAddBlock = (type: BlockType) => {
    addBlock(type);
  };

  if (isPreviewing) {
    return null;
  }

  return (
    <div className="w-80 border-l bg-background flex flex-col h-full min-h-0 overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
          <TabsTrigger
            value="blocks"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <Plus className="w-4 h-4 mr-2" />
            Blocks
          </TabsTrigger>
          <TabsTrigger
            value="settings"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </TabsTrigger>
          {selectedBlock && (
            <TabsTrigger
              value="edit"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              <Type className="w-4 h-4 mr-2" />
              Edit
            </TabsTrigger>
          )}
        </TabsList>

        <ScrollArea className="flex-1 min-h-0">
          <TabsContent value="blocks" className="p-4 space-y-6 pb-20">
            {categoryOrder.map((category) => {
              const blocks = Object.values(blockDefinitions).filter(
                (def) => def.category === category
              );
              if (blocks.length === 0) return null;

              return (
                <div key={category}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                    {categoryLabels[category]}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {blocks.map((def) => (
                      <button
                        key={def.type}
                        onClick={() => handleAddBlock(def.type)}
                        className={cn(
                          'flex flex-col items-center justify-center p-3 rounded-lg border',
                          'hover:border-primary hover:bg-accent transition-colors',
                          'text-center gap-2'
                        )}
                      >
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                          {iconMap[def.icon] || <Plus className="w-5 h-5" />}
                        </div>
                        <span className="text-xs font-medium">{def.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="settings" className="p-4 space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-3">Page Settings</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="primary-color" className="text-xs text-muted-foreground">
                    Primary Color
                  </Label>
                  <div className="flex gap-2 mt-1">
                    <div
                      className="w-10 h-10 rounded-lg border cursor-pointer"
                      style={{ backgroundColor: primaryColor }}
                      onClick={() => {
                        const input = document.getElementById('color-picker');
                        input?.click();
                      }}
                    />
                    <Input
                      id="primary-color"
                      value={primaryColor}
                      onChange={(e) => onPrimaryColorChange(e.target.value)}
                      className="flex-1 font-mono text-sm"
                      maxLength={7}
                    />
                    <input
                      id="color-picker"
                      type="color"
                      value={primaryColor}
                      onChange={(e) => onPrimaryColorChange(e.target.value)}
                      className="sr-only"
                    />
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="edit" className="p-4 pb-20">
            {selectedBlock ? (
              <BlockEditor
                block={selectedBlock}
                onUpdate={(content) => updateBlockContent(selectedBlock.id, content)}
              />
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Select a block to edit
              </div>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

// Simple block editor component
interface BlockEditorProps {
  block: {
    id: string;
    type: string;
    content: Record<string, unknown>;
  };
  onUpdate: (content: Record<string, unknown>) => void;
}

function BlockEditor({ block, onUpdate }: BlockEditorProps) {
  const renderField = (key: string, value: unknown, path: string[] = []) => {
    if (value === null || value === undefined) return null;

    if (typeof value === 'string') {
      return (
        <div key={key}>
          <Label className="text-xs text-muted-foreground capitalize">
            {key.replace(/([A-Z])/g, ' $1').trim()}
          </Label>
          <Input
            value={value}
            onChange={(e) => {
              const newContent = { ...block.content };
              let obj: Record<string, unknown> = newContent;
              for (let i = 0; i < path.length; i++) {
                obj = obj[path[i]] as Record<string, unknown>;
              }
              obj[key] = e.target.value;
              onUpdate(newContent);
            }}
            className="mt-1"
          />
        </div>
      );
    }

    if (typeof value === 'boolean') {
      return (
        <div key={key} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => {
              const newContent = { ...block.content };
              let obj: Record<string, unknown> = newContent;
              for (let i = 0; i < path.length; i++) {
                obj = obj[path[i]] as Record<string, unknown>;
              }
              obj[key] = e.target.checked;
              onUpdate(newContent);
            }}
            className="rounded border-gray-300"
          />
          <Label className="text-xs capitalize">
            {key.replace(/([A-Z])/g, ' $1').trim()}
          </Label>
        </div>
      );
    }

    if (Array.isArray(value)) {
      return (
        <div key={key} className="space-y-2">
          <Label className="text-xs text-muted-foreground capitalize">
            {key.replace(/([A-Z])/g, ' $1').trim()} ({value.length} items)
          </Label>
          <div className="text-xs text-muted-foreground">
            Array editing coming soon...
          </div>
        </div>
      );
    }

    return null;
  };

  const content = block.content as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-sm mb-2 capitalize">{block.type} Block</h3>
        <p className="text-xs text-muted-foreground">
          Edit the content of this block
        </p>
      </div>
      <div className="space-y-4">
        {Object.entries(content).map(([key, value]) => renderField(key, value))}
      </div>
    </div>
  );
}
