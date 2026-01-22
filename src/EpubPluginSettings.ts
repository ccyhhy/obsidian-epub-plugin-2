import { App, PluginSettingTab, Setting, TFolder, Vault } from "obsidian";
import EpubPlugin from "./EpubPlugin";
import { parseColorComponents } from "./utils";

export interface EpubPluginSettings {
	scrolledView: boolean;
	fontSizePercent: number;
	highlightColor: string;
	highlightOpacity: number;
	followObsidianTheme: boolean;
	followObsidianFont: boolean;
	notePath: string;
	useSameFolder: boolean;
	tags: string;
}

export const DEFAULT_SETTINGS: EpubPluginSettings = {
	scrolledView: false,
	fontSizePercent: 100,
	highlightColor: '#ffd700',
	highlightOpacity: 35,
	followObsidianTheme: true,
	followObsidianFont: true,
	notePath: '/',
	useSameFolder: true,
	tags: 'notes/booknotes'
}

export class EpubSettingTab extends PluginSettingTab {
	plugin: EpubPlugin;

	constructor(app: App, plugin: EpubPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'EPUB 设置' });

		const addNote = (parent: HTMLElement, cls: string, text: string) => {
			const note = parent.createDiv({ cls });
			note.createSpan({ cls: "epub-setting-note__badge", text: "提示" });
			note.createSpan({ text });
		};

		const intro = containerEl.createDiv({ cls: "epub-setting-intro" });
		intro.createDiv({ cls: "epub-setting-intro__title", text: "小贴士" });
		addNote(intro, "epub-setting-intro__note", "这里的设置会影响阅读器显示与高亮样式。");

		const readingSection = containerEl.createDiv({ cls: "epub-setting-section" });
		readingSection.createEl("h3", { text: "阅读体验", cls: "epub-setting-section__title" });
		addNote(readingSection, "epub-setting-section__note", "字体、滚动与主题相关设置。");

		new Setting(readingSection)
			.setName("滚动阅读")
			.setDesc("启用后可在页面之间连续滚动。")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.scrolledView)
				.onChange(async (value) => {
					this.plugin.settings.scrolledView = value;
					await this.plugin.saveSettings();
				}));

		new Setting(readingSection)
			.setName("默认字号")
			.setDesc("阅读器默认字体大小（百分比）。")
			.addSlider(slider => slider
				.setLimits(80, 160, 5)
				.setValue(this.plugin.settings.fontSizePercent)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.fontSizePercent = value;
					await this.plugin.saveSettings();
				}));

		new Setting(readingSection)
			.setName("跟随 Obsidian 主题")
			.setDesc("开启后，阅读器明暗主题跟随 Obsidian。")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.followObsidianTheme)
				.onChange(async (value) => {
					this.plugin.settings.followObsidianTheme = value;
					await this.plugin.saveSettings();
				}));

		new Setting(readingSection)
			.setName("跟随 Obsidian 字体")
			.setDesc("开启后，阅读器字体与字号将跟随 Obsidian 设置。")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.followObsidianFont)
				.onChange(async (value) => {
					this.plugin.settings.followObsidianFont = value;
					await this.plugin.saveSettings();
				}));

		const highlightSection = containerEl.createDiv({ cls: "epub-setting-section" });
		highlightSection.createEl("h3", { text: "高亮样式", cls: "epub-setting-section__title" });
		addNote(highlightSection, "epub-setting-section__note", "影响高亮颜色与透明度，并提供预览效果。");
		
		// 颜色预览
		const previewContainer = highlightSection.createDiv({ cls: 'epub-highlight-preview' });
		const colorPreview = previewContainer.createDiv({ cls: 'epub-highlight-preview__swatch' });
		const previewText = previewContainer.createDiv({ cls: 'epub-highlight-preview__text' });
		previewText.createDiv({ cls: 'epub-highlight-preview__title', text: '预览效果' });
		const previewBody = previewText.createDiv({ cls: 'epub-highlight-preview__body' });

		// 更新预览函数
		const updatePreview = () => {
			const color = this.plugin.settings.highlightColor;
			const opacity = this.plugin.settings.highlightOpacity / 100;
			
			// 设置预览方块颜色
			colorPreview.style.backgroundColor = color;
			
			// 设置预览文本高亮
			const rgbaColor = colorToRgba(color, opacity);
			previewBody.innerHTML = `这段<span class=\"epub-highlight-preview__mark\" style=\"background-color: ${rgbaColor};\">文字</span>展示了高亮颜色的效果`;
		};
		
		// 初始更新
		updatePreview();
		
		// 预设颜色
		const presetColors = [
			{ name: '金色', value: '#ffd700' },
			{ name: '黄色', value: '#ffff00' },
			{ name: '浅蓝', value: '#add8e6' },
			{ name: '浅绿', value: '#90ee90' },
			{ name: '浅粉', value: '#ffb6c1' },
			{ name: '橙色', value: '#ffa500' },
			{ name: '青色', value: '#00ffff' },
			{ name: '紫色', value: '#800080' },
		];
		
		const presetContainer = highlightSection.createDiv({ cls: 'epub-preset-colors' });
		presetContainer.createDiv({ cls: 'epub-preset-title', text: '预设颜色:' });
		const presetGrid = presetContainer.createDiv({ cls: 'epub-preset-grid' });
		
		presetColors.forEach(preset => {
			const presetBtn = presetGrid.createEl('button', { cls: 'epub-preset-button' });
			presetBtn.type = 'button';
			presetBtn.style.setProperty('--epub-preset-color', preset.value);
			presetBtn.createSpan({ cls: 'epub-preset-swatch' });
			presetBtn.createSpan({ text: preset.name });
			
			presetBtn.onclick = async () => {
				this.plugin.settings.highlightColor = preset.value;
				await this.plugin.saveSettings();
				updatePreview();
			};
		});

		addNote(highlightSection, "epub-setting-note", "可粘贴 Hex 或 rgb/rgba 颜色值。");

		// 自定义颜色选择器
		new Setting(highlightSection)
			.setName("自定义颜色")
			.setDesc("选择自定义高亮颜色")
			.addColorPicker(colorPicker => {
				colorPicker
					.setValue(this.plugin.settings.highlightColor)
					.onChange(async (value) => {
						this.plugin.settings.highlightColor = value;
						await this.plugin.saveSettings();
						updatePreview();
					});
			});
		
		// 透明度控制
		const opacitySetting = new Setting(highlightSection)
			.setName("高亮透明度")
			.setDesc(`调整高亮颜色的透明度 (${this.plugin.settings.highlightOpacity}%)`)
			.addSlider(slider => slider
				.setLimits(10, 100, 5)
				.setValue(this.plugin.settings.highlightOpacity)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.highlightOpacity = value;
					await this.plugin.saveSettings();
					// 更新设置项的描述
					opacitySetting.setDesc(`调整高亮颜色的透明度 (${value}%)`);
					updatePreview();
				}));
		
		// 重置按钮
		new Setting(highlightSection)
			.setName("重置为默认")
			.setDesc("恢复默认高亮颜色设置")
			.addButton(button => button
				.setButtonText("重置")
				.setCta()
				.onClick(async () => {
					this.plugin.settings.highlightColor = DEFAULT_SETTINGS.highlightColor;
					this.plugin.settings.highlightOpacity = DEFAULT_SETTINGS.highlightOpacity;
					await this.plugin.saveSettings();
					updatePreview();
					// 重新渲染设置界面以更新滑块值
					this.display();
				}));

		const noteSection = containerEl.createDiv({ cls: "epub-setting-section" });
		noteSection.createEl("h3", { text: "笔记与存放", cls: "epub-setting-section__title" });
		addNote(noteSection, "epub-setting-section__note", "用于创建 epub 笔记的默认位置与标签。");

		new Setting(noteSection)
			.setName("同目录")
			.setDesc("开启后，epub 笔记文件将创建在与书籍相同的文件夹。")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useSameFolder)
				.onChange(async (value) => {
					this.plugin.settings.useSameFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(noteSection)
			.setName("笔记文件夹")
			.setDesc("选择 epub 笔记默认保存位置。开启“同目录”后此项无效。")
			.addDropdown(dropdown => dropdown
				.addOptions(getFolderOptions(this.app))
				.setValue(this.plugin.settings.notePath)
				.onChange(async (value) => {
					this.plugin.settings.notePath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(noteSection)
			.setName("标签")
			.setDesc("新建笔记的元数据标签。")
			.addText(text => {
				text.inputEl.size = 50;
				text
					.setValue(this.plugin.settings.tags)
					.onChange(async (value) => {
						this.plugin.settings.tags = value;
						await this.plugin.saveSettings();
					})
			});
	}
}

function getFolderOptions(app: App) {
	const options: Record<string, string> = {};

	Vault.recurseChildren(app.vault.getRoot(), (f) => {
		if (f instanceof TFolder) {
			options[f.path] = f.path;
		}
	});

	return options;
}

// 辅助函数：将hex颜色转换为rgba
function colorToRgba(input: string, alpha: number): string {
	const { r, g, b, alpha: colorAlpha } = parseColorComponents(input);
	const resolvedAlpha = Math.min(1, Math.max(0, alpha * colorAlpha));
	return `rgba(${r}, ${g}, ${b}, ${resolvedAlpha})`;
}
