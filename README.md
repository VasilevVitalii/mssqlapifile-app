<div id="badges">
  <a href="https://www.linkedin.com/in/vasilev-vitalii/">
    <img src="https://img.shields.io/badge/LinkedIn-blue?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn Badge"/>
  </a>
</div>

# ![logo](/artifacts/logo.png)
# mssqlapifile-app

**Loader files to MS SQL Server**
Service for Windows and Linux. Load files to MS SQL Server from specific path

## 1. getting started

From https://drive.google.com/drive/folders/1pyaU1Iiy1mTNiwUftyJhOeMbY1N1tyof?usp=sharing download this compiled app for windows or linux.
Unzip and run, change created setting file mssqlapifile-app.json

## 2. how it works

1. it is assumed that the app will run as a service in continuous mode
2. app constantly scan the directories specified in the settings
3. if a new file appears in the directory, it will be uploaded to the Microsoft SQL Server

## 3. detailed description

### 3.1. logging
3.1.1.
