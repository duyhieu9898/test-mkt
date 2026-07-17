'use client';

import { useState } from 'react';
import { Image as ImageIcon, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MediaPickerDialog } from './media-picker-dialog';

interface EditorBlock {
  id: string;
  type: string;
  content: Record<string, any>;
}

interface BlockContentEditorProps {
  block: EditorBlock;
  companyId: string;
  onUpdate: (content: Record<string, unknown>) => void;
}

interface FieldProps {
  label: string;
  value?: string;
  placeholder?: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}

function TextField({ label, value, placeholder, multiline, onChange }: FieldProps) {
  const Control = multiline ? Textarea : Input;
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Control
        value={value || ''}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={multiline ? 'min-h-20 resize-y' : undefined}
      />
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-gray-300"
      />
      {label}
    </label>
  );
}

function LinkFields({
  label,
  url,
  openInNewTab,
  onUrlChange,
  onTargetChange,
}: {
  label: string;
  url?: string;
  openInNewTab?: boolean;
  onUrlChange: (value: string) => void;
  onTargetChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <TextField
        label={label}
        value={url}
        placeholder="https://..., /page, #section, mailto: or tel:"
        onChange={onUrlChange}
      />
      <ToggleField
        label="Open in a new tab"
        checked={openInNewTab}
        onChange={onTargetChange}
      />
    </div>
  );
}

function MediaField({
  companyId,
  label,
  value,
  alt,
  onChange,
  onAltChange,
}: {
  companyId: string;
  label: string;
  value?: string;
  alt?: string;
  onChange: (url: string, name: string) => void;
  onAltChange: (alt: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {value ? (
        <div className="overflow-hidden rounded-md border">
          <div className="relative aspect-video bg-muted">
            <img src={value} alt={alt || ''} className="h-full w-full object-cover" />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-2 top-2 h-8 w-8"
              title="Remove image"
              onClick={() => onChange('', '')}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="w-full rounded-none"
            onClick={() => setOpen(true)}
          >
            <ImageIcon className="mr-2 h-4 w-4" />
            Replace image
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>
          <ImageIcon className="mr-2 h-4 w-4" />
          Choose image
        </Button>
      )}

      {value && (
        <TextField
          label="Image description"
          value={alt}
          placeholder="Describe the image for accessibility"
          onChange={onAltChange}
        />
      )}

      <MediaPickerDialog
        open={open}
        onOpenChange={setOpen}
        companyId={companyId}
        onSelect={(asset) => onChange(asset.url, asset.name)}
      />
    </div>
  );
}

function GenericFields({
  content,
  onUpdate,
}: {
  content: Record<string, any>;
  onUpdate: (content: Record<string, unknown>) => void;
}) {
  const update = (key: string, value: unknown) => onUpdate({ ...content, [key]: value });

  return (
    <>
      {Object.entries(content).map(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
        if (typeof value === 'string') {
          return (
            <TextField
              key={key}
              label={label}
              value={value}
              multiline={value.length > 80 || /description|quote|answer/i.test(key)}
              onChange={(next) => update(key, next)}
            />
          );
        }
        if (typeof value === 'boolean') {
          return (
            <ToggleField
              key={key}
              label={label}
              checked={value}
              onChange={(next) => update(key, next)}
            />
          );
        }
        if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
          return (
            <TextField
              key={key}
              label={`${label} (one per line)`}
              value={value.join('\n')}
              multiline
              onChange={(next) => update(key, next.split('\n').map((item) => item.trim()).filter(Boolean))}
            />
          );
        }
        if (Array.isArray(value) && value.every((item) => item && typeof item === 'object')) {
          return (
            <div key={key} className="space-y-2">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              {value.map((item, index) => (
                <div key={index} className="space-y-2 rounded-md border p-3">
                  {Object.entries(item).map(([itemKey, itemValue]) =>
                    typeof itemValue === 'string' ? (
                      <TextField
                        key={itemKey}
                        label={itemKey.replace(/([A-Z])/g, ' $1')}
                        value={itemValue}
                        multiline={String(itemValue).length > 80}
                        onChange={(next) => {
                          const items = value.map((current, currentIndex) =>
                            currentIndex === index ? { ...current, [itemKey]: next } : current,
                          );
                          update(key, items);
                        }}
                      />
                    ) : null,
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => update(key, value.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </Button>
                </div>
              ))}
              {value[0] && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const empty = Object.fromEntries(
                      Object.entries(value[0]).map(([itemKey, itemValue]) => [
                        itemKey,
                        typeof itemValue === 'boolean' ? false : typeof itemValue === 'number' ? 0 : '',
                      ]),
                    );
                    update(key, [...value, empty]);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add item
                </Button>
              )}
            </div>
          );
        }
        return null;
      })}
    </>
  );
}

export function BlockContentEditor({
  block,
  companyId,
  onUpdate,
}: BlockContentEditorProps) {
  const content = block.content;
  const patch = (changes: Record<string, unknown>) => onUpdate({ ...content, ...changes });

  const header = (
    <div>
      <h3 className="text-sm font-semibold capitalize">{block.type} block</h3>
      <p className="mt-1 text-xs text-muted-foreground">Edit what visitors see and where actions lead.</p>
    </div>
  );

  if (block.type === 'hero') {
    const backgroundImage = content.backgroundImage || content.imageUrl || content.heroImage || '';
    return (
      <div className="space-y-4">
        {header}
        <TextField label="Headline" value={content.headline} onChange={(headline) => patch({ headline })} />
        <TextField label="Subheadline" value={content.subheadline} multiline onChange={(subheadline) => patch({ subheadline })} />
        <MediaField
          companyId={companyId}
          label="Background image"
          value={backgroundImage}
          alt={content.backgroundImageAlt}
          onChange={(backgroundImage, name) => patch({ backgroundImage, backgroundImageAlt: content.backgroundImageAlt || name })}
          onAltChange={(backgroundImageAlt) => patch({ backgroundImageAlt })}
        />
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Text alignment</Label>
          <Select value={content.alignment || 'center'} onValueChange={(alignment) => patch({ alignment })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <TextField label="Primary button text" value={content.ctaText} onChange={(ctaText) => patch({ ctaText })} />
        <LinkFields
          label="Primary button destination"
          url={content.ctaUrl}
          openInNewTab={content.ctaOpenInNewTab}
          onUrlChange={(ctaUrl) => patch({ ctaUrl })}
          onTargetChange={(ctaOpenInNewTab) => patch({ ctaOpenInNewTab })}
        />
        <TextField label="Secondary button text" value={content.ctaSecondaryText} onChange={(ctaSecondaryText) => patch({ ctaSecondaryText })} />
        <LinkFields
          label="Secondary button destination"
          url={content.ctaSecondaryUrl}
          openInNewTab={content.ctaSecondaryOpenInNewTab}
          onUrlChange={(ctaSecondaryUrl) => patch({ ctaSecondaryUrl })}
          onTargetChange={(ctaSecondaryOpenInNewTab) => patch({ ctaSecondaryOpenInNewTab })}
        />
      </div>
    );
  }

  if (block.type === 'cta') {
    return (
      <div className="space-y-4">
        {header}
        <TextField label="Title" value={content.title} onChange={(title) => patch({ title })} />
        <TextField label="Description" value={content.description} multiline onChange={(description) => patch({ description })} />
        <TextField label="Primary button text" value={content.ctaText} onChange={(ctaText) => patch({ ctaText })} />
        <LinkFields
          label="Primary button destination"
          url={content.ctaUrl}
          openInNewTab={content.ctaOpenInNewTab}
          onUrlChange={(ctaUrl) => patch({ ctaUrl })}
          onTargetChange={(ctaOpenInNewTab) => patch({ ctaOpenInNewTab })}
        />
        <TextField label="Secondary button text" value={content.ctaSecondaryText} onChange={(ctaSecondaryText) => patch({ ctaSecondaryText })} />
        <LinkFields
          label="Secondary button destination"
          url={content.ctaSecondaryUrl}
          openInNewTab={content.ctaSecondaryOpenInNewTab}
          onUrlChange={(ctaSecondaryUrl) => patch({ ctaSecondaryUrl })}
          onTargetChange={(ctaSecondaryOpenInNewTab) => patch({ ctaSecondaryOpenInNewTab })}
        />
        <ToggleField
          label="Collect email addresses"
          checked={content.showEmailCapture}
          onChange={(showEmailCapture) => patch({ showEmailCapture })}
        />
      </div>
    );
  }

  if (block.type === 'image') {
    return (
      <div className="space-y-4">
        {header}
        <MediaField
          companyId={companyId}
          label="Image"
          value={content.url}
          alt={content.alt}
          onChange={(url, name) => patch({ url, alt: content.alt || name })}
          onAltChange={(alt) => patch({ alt })}
        />
        <TextField label="Caption" value={content.caption} onChange={(caption) => patch({ caption })} />
        <LinkFields
          label="Open this link when the image is clicked"
          url={content.linkUrl}
          openInNewTab={content.openInNewTab}
          onUrlChange={(linkUrl) => patch({ linkUrl })}
          onTargetChange={(openInNewTab) => patch({ openInNewTab })}
        />
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Image shape</Label>
          <Select value={content.aspectRatio || 'wide'} onValueChange={(aspectRatio) => patch({ aspectRatio })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Original</SelectItem>
              <SelectItem value="wide">Wide</SelectItem>
              <SelectItem value="square">Square</SelectItem>
              <SelectItem value="portrait">Portrait</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  if (block.type === 'features') {
    const features = Array.isArray(content.features) ? content.features : [];
    return (
      <div className="space-y-4">
        {header}
        <TextField label="Title" value={content.title} onChange={(title) => patch({ title })} />
        <TextField label="Subtitle" value={content.subtitle} onChange={(subtitle) => patch({ subtitle })} />
        {features.map((feature: Record<string, any>, index: number) => (
          <div key={index} className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Feature {index + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={() => patch({ features: features.filter((_: unknown, itemIndex: number) => itemIndex !== index) })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <TextField label="Title" value={feature.title} onChange={(title) => patch({ features: features.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, title } : item) })} />
            <TextField label="Description" value={feature.description} multiline onChange={(description) => patch({ features: features.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, description } : item) })} />
            <MediaField
              companyId={companyId}
              label="Feature image"
              value={feature.image || feature.imageUrl}
              alt={feature.imageAlt}
              onChange={(image, name) => patch({ features: features.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, image, imageAlt: item.imageAlt || name } : item) })}
              onAltChange={(imageAlt) => patch({ features: features.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, imageAlt } : item) })}
            />
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => patch({ features: [...features, { title: 'New feature', description: '', icon: 'sparkles' }] })}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add feature
        </Button>
      </div>
    );
  }

  if (block.type === 'pricing') {
    const plans = Array.isArray(content.plans) ? content.plans : [];
    return (
      <div className="space-y-4">
        {header}
        <TextField label="Title" value={content.title} onChange={(title) => patch({ title })} />
        <TextField label="Subtitle" value={content.subtitle} onChange={(subtitle) => patch({ subtitle })} />
        {plans.map((plan: Record<string, any>, index: number) => {
          const updatePlan = (changes: Record<string, unknown>) =>
            patch({ plans: plans.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, ...changes } : item) });
          return (
            <div key={index} className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Plan {index + 1}</span>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => patch({ plans: plans.filter((_: unknown, itemIndex: number) => itemIndex !== index) })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <TextField label="Name" value={plan.name} onChange={(name) => updatePlan({ name })} />
              <div className="grid grid-cols-2 gap-2">
                <TextField label="Price" value={plan.price} onChange={(price) => updatePlan({ price })} />
                <TextField label="Period" value={plan.period} onChange={(period) => updatePlan({ period })} />
              </div>
              <TextField label="Description" value={plan.description} multiline onChange={(description) => updatePlan({ description })} />
              <TextField label="Features (one per line)" value={(plan.features || []).join('\n')} multiline onChange={(value) => updatePlan({ features: value.split('\n').map((item) => item.trim()).filter(Boolean) })} />
              <TextField label="Button text" value={plan.ctaText} onChange={(ctaText) => updatePlan({ ctaText })} />
              <LinkFields
                label="Button destination"
                url={plan.ctaUrl}
                openInNewTab={plan.ctaOpenInNewTab}
                onUrlChange={(ctaUrl) => updatePlan({ ctaUrl })}
                onTargetChange={(ctaOpenInNewTab) => updatePlan({ ctaOpenInNewTab })}
              />
              <ToggleField label="Highlight this plan" checked={plan.featured} onChange={(featured) => updatePlan({ featured })} />
            </div>
          );
        })}
        <Button type="button" variant="outline" className="w-full" onClick={() => patch({ plans: [...plans, { name: 'New plan', price: '$0', features: [], ctaText: 'Get started', ctaUrl: '#contact', featured: false }] })}>
          <Plus className="mr-2 h-4 w-4" />
          Add plan
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}
      <GenericFields content={content} onUpdate={onUpdate} />
    </div>
  );
}
