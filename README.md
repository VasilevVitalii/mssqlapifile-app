<div id="badges">
  <a href="https://www.linkedin.com/in/vasilev-vitalii/">
    <img src="https://img.shields.io/badge/LinkedIn-blue?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn Badge"/>
  </a>
</div>

# mssqlapifile-app

Service for Windows and Linux. Load files to MS SQL Server from specific path

## 1. how it works

1. it is assumed that the app will run as a service in continuous mode
2. app constantly scan the directories specified in the settings
3. if a new file appears in the directory, it will be uploaded to the Microsoft SQL Server

## 2. getting started

From https://drive.google.com/drive/folders/1pyaU1Iiy1mTNiwUftyJhOeMbY1N1tyof?usp=sharing download this compiled app for windows or linux.
Unzip and run, change created setting file mssqlapifile-app.json. After changing mssqlapifile-app.json, there is no need to restart the service.

## 3. mssqlapifile-app.json

1. **"mssql.connection.*".** MS SQL Server connection settings. Supported only "SQL Server Authentication" and not supported "Windows Authentication"
2. **"mssql.connection.maxStreams".** Maximum number of parallel connections to MS SQL Server
3. **"mssql.queries.*".**  Сontains all queries with which service will upload file data (and not only) to the MS SQL Server.
Parameter "key" must be unique within all items in this param array. Details will be specified below in the "queries" section
4. **"mssql.queries.queryLoadErrorKey".** refer to **mssql.queries** for loading errors to MS SQL Server. Details will be specified below in the "errors" section
5. **"mssql.queries.queryLoadDigestKey".** refer to **mssql.queries** for periodic loading statistics about the service work to MS SQL Server. Details will be specified below in the "digest" section
6. **"fs.*".** Сontains all directories which service uses in its work - scan new file for load it to MS SQL Server, move loaded file to another directory. Parameter "key" must be unique within all items in this param array.