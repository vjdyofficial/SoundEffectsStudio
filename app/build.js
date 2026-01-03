const builder = require("electron-builder");
const path = require("path");
const product = require("./product.json");
const pkg = require("./package.json"); // for version fallback

builder.build({
    config: {
        appId: "app.vjdyofficial.sfxstudio",
        productName: "SFXStudio",
        icon: "icon.ico",
        asar: false,
        files: [
            "**/*",
            "!sfx/**",
            "!startBuildInstall.ps1",
            "!startBuild.cmd"
        ],
        win: {
            icon: "./icons/icon.ico",
            target: "nsis",
            fileAssociations: [
                {
                    ext: "subw",
                    name: "SFXStudio Bass Preset",
                    description: "SFXStudio Bass Preset",
                    icon: "./icons/iconfile_subw.ico",
                    role: "Editor"
                },
                {
                    ext: "bbcx",
                    name: "BBCode Teleprompt Format",
                    description: "BBCode Teleprompt Format",
                    icon: "./icons/iconfile_bbcx.ico",
                    role: "Editor"
                },
                {
                    ext: "b64i",
                    name: "SFXStudio Base64 Image String",
                    description: "SFXStudio Base64 Image String",
                    icon: "./icons/iconfile_b64i.ico",
                    role: "Editor"
                },
                {
                    ext: "cdt",
                    name: "SFXStudio Chunk Data File",
                    description: "SFXStudio Chunk Data File",
                    icon: "./icons/iconfile_cdt.ico",
                    role: "Editor"
                }
            ]
        },
        nsis: {
            oneClick: true,
            perMachine: false,
            allowToChangeInstallationDirectory: false,
            createDesktopShortcut: true,
            createStartMenuShortcut: true,
            shortcutName: "VJDY FM Sound Effects Studio",
            artifactName: "sfxstudio-setup.exe",
            runAfterFinish: true
        }
    }
})
.then(() => console.log("Build finished successfully!"))
.catch(err => console.error(err));