import { App, PluginSettingTab, Setting, TFolder, Vault } from "obsidian";
import EpubPlugin from "./EpubPlugin";

export interface EpubPluginSettings {
	scrolledView: boolean;
	fontSizePercent: number;
	highlightColor: string;
	followObsidianTheme: boolean;
	followObsidianFont: boolean;
	selectionNotePath: string;
	selectionNoteUseSameFolder: boolean;
	notePath: string;
	useSameFolder: boolean;
	tags: string;
}

export const DEFAULT_SETTINGS: EpubPluginSettings = {
	scrolledView: false,
	fontSizePercent: 100,
	highlightColor: '#ffd700',
	followObsidianTheme: true,
	followObsidianFont: true,
	selectionNotePath: '/',
	selectionNoteUseSameFolder: true,
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

		new Setting(containerEl)
			.setName("滚动阅读")
			.setDesc("启用后可在页面之间连续滚动。")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.scrolledView)
				.onChange(async (value) => {
					this.plugin.settings.scrolledView = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
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

		new Setting(containerEl)
			.setName("跟随 Obsidian 主题")
			.setDesc("开启后，阅读器明暗主题跟随 Obsidian。")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.followObsidianTheme)
				.onChange(async (value) => {
					this.plugin.settings.followObsidianTheme = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("跟随 Obsidian 字体")
			.setDesc("开启后，阅读器字体与字号将跟随 Obsidian 设置。")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.followObsidianFont)
				.onChange(async (value) => {
					this.plugin.settings.followObsidianFont = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("摘录同目录")
			.setDesc("开启后，选中文本创建的笔记将保存到书籍同目录。")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.selectionNoteUseSameFolder)
				.onChange(async (value) => {
					this.plugin.settings.selectionNoteUseSameFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("摘录笔记文件夹")
			.setDesc("选择选中文本笔记的保存位置。开启“摘录同目录”后此项无效。")
			.addDropdown(dropdown => dropdown
				.addOptions(getFolderOptions(this.app))
				.setValue(this.plugin.settings.selectionNotePath)
				.onChange(async (value) => {
					this.plugin.settings.selectionNotePath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("高亮颜色")
			.setDesc("高亮显示颜色（Hex，例如 #ffd700）。")
			.addText(text => {
				text.setPlaceholder("#ffd700");
				text
					.setValue(this.plugin.settings.highlightColor)
					.onChange(async (value) => {
						this.plugin.settings.highlightColor = value.trim();
						await this.plugin.saveSettings();
					})
			});

		new Setting(containerEl)
			.setName("同目录")
			.setDesc("开启后，epub 笔记文件将创建在与书籍相同的文件夹。")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useSameFolder)
				.onChange(async (value) => {
					this.plugin.settings.useSameFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("笔记文件夹")
			.setDesc("选择 epub 笔记默认保存位置。开启“同目录”后此项无效。")
			.addDropdown(dropdown => dropdown
				.addOptions(getFolderOptions(this.app))
				.setValue(this.plugin.settings.notePath)
				.onChange(async (value) => {
					this.plugin.settings.notePath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
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
