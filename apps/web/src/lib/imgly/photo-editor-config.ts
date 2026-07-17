import CreativeEditorSDK from '@cesdk/cesdk-js';
import type CreativeEditorSDKInstance from '@cesdk/cesdk-js';
import type {
  CreativeEngine,
  EditorPlugin,
  EditorPluginContext,
} from '@cesdk/cesdk-js';

export class BannerPhotoEditorConfig implements EditorPlugin {
  name = 'oneperson-banner-photo-editor';
  version = CreativeEditorSDK.version;

  async initialize(ctx: EditorPluginContext) {
    const { cesdk, engine } = ctx;
    if (!cesdk) return;

    cesdk.resetEditor();
    setupFeatures(cesdk);
    setupPanels(cesdk);
    setupNavigationBar(cesdk);
    setupCanvas(cesdk);
    setupInspectorBar(cesdk);
    setupDock(cesdk);
    setupActions(cesdk);
    setupTranslations(cesdk);
    setupSettings(engine);
    cesdk.reapplyLegacyUserConfiguration();
  }
}

function setupFeatures(cesdk: CreativeEditorSDKInstance) {
  cesdk.feature.enable([
    'ly.img.navigation.bar',
    'ly.img.navigation.close',
    'ly.img.navigation.undoRedo',
    'ly.img.navigation.zoom',
    'ly.img.navigation.actions',
    'ly.img.navigation.documentSettings',
    'ly.img.text',
    'ly.img.crop',
    'ly.img.filter',
    'ly.img.adjustment',
    'ly.img.effect',
    'ly.img.blur',
    'ly.img.shadow',
    'ly.img.delete',
    'ly.img.duplicate',
    'ly.img.group',
    'ly.img.replace',
    'ly.img.fill',
    'ly.img.fill.color',
    'ly.img.fill.image',
    'ly.img.stroke',
    'ly.img.opacity',
    'ly.img.blendMode',
    'ly.img.page',
    'ly.img.page.resize',
    'ly.img.page.settings',
    'ly.img.shape.options',
    'ly.img.combine',
    'ly.img.position',
    'ly.img.options',
    'ly.img.notifications',
    'ly.img.dock',
    'ly.img.library.panel',
    'ly.img.inspector.bar',
    'ly.img.canvas.menu',
    'ly.img.rulers',
  ]);

  const isNotPageSelection = ({ engine }: { engine: CreativeEngine }) => {
    const selectedBlocks = engine.block.findAllSelected();
    return !selectedBlocks.some((id) => engine.block.getType(id) === '//ly.img.ubq/page');
  };

  cesdk.feature.set('ly.img.stroke', isNotPageSelection);
  cesdk.feature.set('ly.img.canvas.menu', isNotPageSelection);
  cesdk.feature.set('ly.img.inspector.bar', isNotPageSelection);
  cesdk.feature.set('ly.img.shape.options.lineWidth', ({ engine }: { engine: CreativeEngine }) => {
    const [selectedBlock] = engine.block.findAllSelected();
    return selectedBlock != null && engine.block.isLineOrigin(selectedBlock);
  });
}

function setupPanels(cesdk: CreativeEditorSDKInstance) {
  cesdk.ui.setPanelPosition('//ly.img.panel/inspector', 'left');
  cesdk.ui.setPanelFloating('//ly.img.panel/inspector', false);
  cesdk.ui.setPanelPosition('//ly.img.panel/assets', 'left');
  cesdk.ui.setPanelFloating('//ly.img.panel/assets', false);
  cesdk.ui.setPanelPosition('//ly.img.panel/assetLibrary', 'left');
  cesdk.ui.setPanelFloating('//ly.img.panel/assetLibrary', false);
}

function setupNavigationBar(cesdk: CreativeEditorSDKInstance) {
  cesdk.ui.setComponentOrder({ in: 'ly.img.navigation.bar' }, [
    'ly.img.documentSettings.navigationBar',
    'ly.img.undoRedo.navigationBar',
    'ly.img.spacer',
    'ly.img.title.navigationBar',
    'ly.img.spacer',
    'ly.img.zoom.navigationBar',
    'ly.img.preview.navigationBar',
  ]);
}

function setupCanvas(cesdk: CreativeEditorSDKInstance) {
  cesdk.ui.setComponentOrder({ in: 'ly.img.canvas.bar', at: 'bottom' }, [
    'ly.img.settings.canvasBar',
    'ly.img.spacer',
    'ly.img.page.add.canvasBar',
    'ly.img.spacer',
  ]);

  cesdk.ui.setComponentOrder({ in: 'ly.img.canvas.menu', when: { editMode: 'Transform' } }, [
    'ly.img.group.enter.canvasMenu',
    'ly.img.group.select.canvasMenu',
    'ly.img.page.moveUp.canvasMenu',
    'ly.img.page.moveDown.canvasMenu',
    'ly.img.separator',
    'ly.img.text.edit.canvasMenu',
    'ly.img.replace.canvasMenu',
    'ly.img.separator',
    'ly.img.bringForward.canvasMenu',
    'ly.img.sendBackward.canvasMenu',
    'ly.img.separator',
    'ly.img.duplicate.canvasMenu',
    'ly.img.delete.canvasMenu',
    'ly.img.separator',
    'ly.img.options.canvasMenu',
  ]);

  cesdk.ui.setComponentOrder({ in: 'ly.img.canvas.menu', when: { editMode: 'Text' } }, [
    'ly.img.text.color.canvasMenu',
    'ly.img.separator',
    'ly.img.text.bold.canvasMenu',
    'ly.img.text.italic.canvasMenu',
    'ly.img.text.underline.canvasMenu',
    'ly.img.text.strikethrough.canvasMenu',
    'ly.img.separator',
    'ly.img.text.list.unordered.canvasMenu',
    'ly.img.text.list.ordered.canvasMenu',
    'ly.img.separator',
    'ly.img.text.variables.canvasMenu',
  ]);
}

function setupInspectorBar(cesdk: CreativeEditorSDKInstance) {
  cesdk.ui.setComponentOrder({ in: 'ly.img.inspector.bar', when: { editMode: 'Transform' } }, [
    'ly.img.spacer',
    'ly.img.video.caption.inspectorBar',
    'ly.img.shape.options.inspectorBar',
    'ly.img.cutout.type.inspectorBar',
    'ly.img.cutout.offset.inspectorBar',
    'ly.img.cutout.smoothing.inspectorBar',
    'ly.img.group.create.inspectorBar',
    'ly.img.group.ungroup.inspectorBar',
    'ly.img.audio.replace.inspectorBar',
    'ly.img.separator',
    'ly.img.text.typeFace.inspectorBar',
    'ly.img.text.style.inspectorBar',
    'ly.img.text.bold.inspectorBar',
    'ly.img.text.italic.inspectorBar',
    'ly.img.text.fontSize.inspectorBar',
    'ly.img.text.alignHorizontal.inspectorBar',
    'ly.img.text.advanced.inspectorBar',
    'ly.img.combine.inspectorBar',
    'ly.img.separator',
    'ly.img.fill.inspectorBar',
    'ly.img.trim.inspectorBar',
    'ly.img.volume.inspectorBar',
    'ly.img.crop.inspectorBar',
    'ly.img.separator',
    'ly.img.stroke.inspectorBar',
    'ly.img.separator',
    'ly.img.text.background.inspectorBar',
    'ly.img.separator',
    {
      id: 'ly.img.appearance.inspectorBar',
      children: [
        'ly.img.adjustment.inspectorBar',
        'ly.img.filter.inspectorBar',
        'ly.img.effect.inspectorBar',
        'ly.img.blur.inspectorBar',
      ],
    },
    'ly.img.separator',
    'ly.img.shadow.inspectorBar',
    'ly.img.separator',
    'ly.img.opacityOptions.inspectorBar',
    'ly.img.separator',
    'ly.img.position.inspectorBar',
    'ly.img.spacer',
    'ly.img.separator',
    'ly.img.inspectorToggle.inspectorBar',
  ]);

  cesdk.ui.setComponentOrder({ in: 'ly.img.inspector.bar', when: { editMode: 'Trim' } }, [
    'ly.img.trimControls.inspectorBar',
  ]);
  cesdk.ui.setComponentOrder({ in: 'ly.img.inspector.bar', when: { editMode: 'Crop' } }, [
    'ly.img.cropControls.inspectorBar',
  ]);
  cesdk.ui.setComponentOrder({ in: 'ly.img.inspector.bar', when: { editMode: 'Vector' } }, [
    'ly.img.vectorEdit.moveMode.inspectorBar',
    'ly.img.vectorEdit.addMode.inspectorBar',
    'ly.img.vectorEdit.deleteMode.inspectorBar',
    'ly.img.separator',
    'ly.img.vectorEdit.bendMode.inspectorBar',
    'ly.img.vectorEdit.mirrorMode.inspectorBar',
    'ly.img.separator',
    'ly.img.vectorEdit.done.inspectorBar',
  ]);
}

function setupDock(cesdk: CreativeEditorSDKInstance) {
  const { engine, ui } = cesdk;
  engine.editor.setSetting('dock/hideLabels', false);
  engine.editor.setSetting('dock/iconSize', 'large');

  const openAssetPanel = (entries: string[], title: string) => {
    const payload = { entries, title };
    if (ui.isPanelOpen('//ly.img.panel/assetLibrary', { payload })) {
      ui.closePanel('//ly.img.panel/assetLibrary');
      return;
    }
    ui.closePanel('*');
    ui.openPanel('//ly.img.panel/assetLibrary', { payload });
  };

  ui.setComponentOrder({ in: 'ly.img.dock' }, [
    'ly.img.spacer',
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.crop',
      icon: '@imgly/Crop',
      label: 'Crop',
      entries: [],
      isSelected: () => engine.editor.getEditMode() === 'Crop',
      onClick: () => {
        const page = engine.scene.getCurrentPage();
        if (page == null) return;
        if (engine.editor.getEditMode() === 'Crop') {
          engine.editor.setEditMode('Transform');
          return;
        }
        ui.closePanel('*');
        engine.block.select(page);
        engine.editor.setEditMode('Crop');
      },
    },
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.adjustment',
      icon: '@imgly/Adjustments',
      label: 'Adjust',
      entries: [],
      isSelected: () => ui.isPanelOpen('//ly.img.panel/inspector/adjustments'),
      onClick: () => openInspectorPanel(cesdk, '//ly.img.panel/inspector/adjustments'),
    },
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.filter',
      icon: '@imgly/Filter',
      label: 'Filter',
      entries: [],
      isSelected: () => ui.isPanelOpen('//ly.img.panel/inspector/filters'),
      onClick: () => openInspectorPanel(cesdk, '//ly.img.panel/inspector/filters'),
    },
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.effects',
      icon: '@imgly/Effects',
      label: 'Effects',
      entries: [],
      isSelected: () => ui.isPanelOpen('//ly.img.panel/inspector/effects'),
      onClick: () => openInspectorPanel(cesdk, '//ly.img.panel/inspector/effects'),
    },
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.blur',
      icon: '@imgly/Blur',
      label: 'Blur',
      entries: [],
      isSelected: () => ui.isPanelOpen('//ly.img.panel/inspector/blur'),
      onClick: () => openInspectorPanel(cesdk, '//ly.img.panel/inspector/blur'),
    },
    { id: 'ly.img.separator', key: 'ly.img.separator.photo' },
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.image',
      icon: '@imgly/Image',
      label: 'Images',
      entries: ['ly.img.image', 'ly.img.image.upload'],
      onClick: () => openAssetPanel(['ly.img.image', 'ly.img.image.upload'], 'libraries.ly.img.image.label'),
    },
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.text',
      icon: '@imgly/Text',
      label: 'libraries.ly.img.text.label',
      entries: ['ly.img.text'],
      onClick: () => openAssetPanel(['ly.img.text'], 'libraries.ly.img.text.label'),
    },
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.vector.shape',
      icon: '@imgly/Shapes',
      label: 'libraries.ly.img.vector.shape.label',
      entries: ['ly.img.vector.shape'],
      onClick: () => openAssetPanel(['ly.img.vector.shape'], 'libraries.ly.img.vector.shape.label'),
    },
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.sticker',
      icon: '@imgly/Sticker',
      label: 'libraries.ly.img.sticker.label',
      entries: ['ly.img.sticker'],
      onClick: () => openAssetPanel(['ly.img.sticker'], 'libraries.ly.img.sticker.label'),
    },
    {
      id: 'ly.img.assetLibrary.dock',
      key: 'ly.img.templates',
      icon: '@imgly/Template',
      label: 'Templates',
      entries: ['ly.img.templates'],
      onClick: () => openAssetPanel(['ly.img.templates'], 'libraries.ly.img.templates.label'),
    },
    'ly.img.spacer',
  ]);
}

function openInspectorPanel(cesdk: CreativeEditorSDKInstance, panelId: string) {
  const { engine, ui } = cesdk;
  if (ui.isPanelOpen(panelId)) {
    ui.closePanel(panelId);
    return;
  }
  const page = engine.scene.getCurrentPage();
  if (page == null) return;
  ui.closePanel('*');
  engine.editor.setEditMode('Transform');
  engine.block.select(page);
  ui.openPanel(panelId, { floating: true });
}

function setupActions(cesdk: CreativeEditorSDKInstance) {
  cesdk.actions.register('exportDesign', async (exportOptions) => {
    const { blobs, options } = await cesdk.utils.export(exportOptions);
    await cesdk.utils.downloadFile(blobs[0], options.mimeType);
  });
}

function setupTranslations(cesdk: CreativeEditorSDKInstance) {
  cesdk.i18n.setTranslations({
    en: {
      'libraries.ly.img.image.label': 'Images',
      'libraries.ly.img.sticker.label': 'Stickers',
      'libraries.ly.img.templates.label': 'Templates',
      'libraries.ly.img.text.label': 'Text',
      'libraries.ly.img.vector.shape.label': 'Shapes',
    },
  });
}

function setupSettings(engine: CreativeEngine) {
  engine.editor.setSetting('doubleClickToCropEnabled', false);
  engine.editor.setSetting('doubleClickSelectionMode', 'Hierarchical');
  engine.editor.setSetting('page/allowCropInteraction', true);
  engine.editor.setSetting('page/dimOutOfPageAreas', true);
  engine.editor.setSetting('page/moveChildrenWhenCroppingFill', true);
  engine.editor.setSetting('page/selectWhenNoBlocksSelected', true);
  engine.editor.setSetting('page/highlightWhenCropping', true);
  engine.editor.setSetting('page/title/show', false);
  engine.editor.setSetting('page/title/showOnSinglePage', true);
  engine.editor.setSetting('blockAnimations/enabled', false);
  engine.editor.setSetting('playback/showAllBlocks', true);
  engine.editor.setSetting('placeholderControls/showOverlay', true);
  engine.editor.setSetting('placeholderControls/showButton', true);
  engine.editor.setSetting('colorPicker/colorMode', 'Any');
  engine.editor.setSetting('upload/supportedMimeTypes', 'image/png,image/jpeg,image/webp,image/svg+xml');
}
