<div id="badges">
	<a href="https://www.linkedin.com/in/vasilev-vitalii/">
		<img src="https://img.shields.io/badge/LinkedIn-blue?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn Badge"/>
	</a>
  <a href="https://www.youtube.com/channel/UChlSfeGAF1fTDwu6-5b3dnQ">
    <img src="https://img.shields.io/badge/YouTube-red?style=for-the-badge&logo=youtube&logoColor=white" alt="Youtube Badge"/>
  </a>
</div>

# mssqlapifile-app

Service for Windows and Linux. Load files to MS SQL Server from a specific path

-   Video (RUS) - https://youtu.be/2gGAoqU95t4
-   Video (ENG) - https://youtu.be/lehL7NmRHHs

## 1. how it works

1. it is assumed that the app will run as a service in continuous mode
2. service constantly scans the directories specified in the settings
3. if a new file appears in the directory, it will be uploaded to Microsoft SQL Server

## 2. getting started

From https://github.com/VasilevVitalii/mssqlapifile-app/releases download this compiled app for windows or linux.
Unzip and run, change created setting file mssqlapifile-app.json. After changing mssqlapifile-app.json, there is no need to restart the service.

## 3. mssqlapifile-app.json

1. **"mssql.connection.*".** MS SQL Server connection settings. Supported only "SQL Server Authentication" and not supported "Windows Authentication"
2. **"mssql.connection.maxStreams".** Maximum number of parallel connections to MS SQL Server
3. **"mssql.queries.*".**  Сontains all queries with which service will upload data from file (and not only) to the MS SQL Server.
Parameter "key" must be unique within all items in this param array. Details will be specified below in the [queries section](#queries)
4. **"mssql.queryLoadErrorKey".** Refer to **mssql.queries** for loading errors to MS SQL Server. Details will be specified below in the "errors" section
5. **"mssql.queryLoadDigestKey".** Refer to **mssql.queries** for periodic loading statistics about the service work to MS SQL Server. Details will be specified below in the [queries section](#queries)
6. **"fs.*".** Сontains all directories which service uses in its work - scan new file to load it to MS SQL Server, move loaded file to another directory. Parameter "key" must be unique within all items in this param array
7. **"scan".** Array of rules by which files are searched for uploading to the MS SQL Server. Each item consists of
	- **"pathKey".** Directory to scan. Refer to **fs**. Сan be specified subdirectories
	- **"mask".** File mask. Can be specified subdirectories, but mask symbols can only contain the file name. Good masks: *"\*.txt"*, *"/subfolder/\*.txt"*. Bad masks: *"/subfolder\*/\*.txt"*, *"/subfolder/\*/\*.txt"*
	- **"modeLoad".** File read option. Details will be specified below in the [queries section](#queries)
	- **"logFileErrorPathKey".** Directory for moving files that failed to load to MS SQL Server
	- **"logFileSuccessPathKey".** Directory for moving files that were successfully uploaded to the server
	- **"queryLoadKey".** Query to load file data to MS SQL Server. Refer to **mssql.queries**. Details will be specified below in the [queries section](#queries)
8. **"service.holdManual".** Various options for pausing the service or stopping it
	- **"holdManual".**  If this parameter is set to "success", the service will pause. Files will not be loaded to the MS SQL SERver at this time
	- **"stop".** Setting the service stop time (examples: "03:45", "23:15"). If additional third-party mechanisms are used to autostart a stopped service, the service will be restarted
	- **"holdAuto".** Setting the time period during which the service will not load data to MS SQL Server (**duration** in minutes). If, for example, "saturday": {"time": "23:30", "duration": 120}, service will not work from saturday 23:30 to sunday 01:30
9. **"log".** Service writes logs to "log" folder, which is located in the same directory
	- **"logAllowTrace".** Enable or disable "trace" level. Other levels ("debug" and "error") are always enabled
	- **"logLifeDays".** How many days to keep files in "log" folder
	- **"logFileErrorLifeDays", "logFileSuccessLifeDays".** These settings are not used

## <a id="queries">4. Queries</a>

Service load to MS SQL Server data files, errors and digest. Digest - service statistics (how many files were loaded successfully, loading how many files caused an error) generated every 10 minutes. Can be used to check that the service is running.

1. **Load errors.** every minute, based on the accumulated errors
	- in setting in section **mssql.queries** find query whose key is equal to param **mssql.queryLoadErrorKey**
	- if the query is not found, load errors to MS SQL Server will not happen
	- first part of the query is generated. Founded query is added to it, example:
	```sql
	-- first path
	IF OBJECT_ID('tempdb..#mssqlapifile_app_errors') IS NOT NULL DROP TABLE #mssqlapifile_app_errors
	CREATE TABLE #mssqlapifile_app_errors([id] INT IDENTITY(1,1), [message] NVARCHAR(MAX))
	INSERT INTO #mssqlapifile_app_errors([message])
	SELECT 'text for error 1' UNION ALL
	SELECT 'text for error 2'
	-- example your query in setting
	INSERT INTO [dbo].[YourErrorStorage] ([message])
	SELECT [message] FROM #mssqlapifile_app_errors ORDER BY [id]
	```
	- final script is run on the MS SQL Server
2. **Load digest.** every 10 minute
	- in setting in section **mssql.queries** find query whose key is equal to param **mssql.queryLoadDigestKey**
	- if the query is not found, load digest to MS SQL Server will not happen
	- first part of the query is generated. Founded query is added to it, example:
	```sql
	-- first path
    DECLARE @countSuccess INT; SET @countSuccess = 45
    DECLARE @countError INT; SET @countError = 2
    DECLARE @countQueue INT; SET @countQueue = 0
	-- example your query in setting
	INSERT INTO [dbo].[YourDigestStorage] ([countSuccess], [countError], [countQueue], [dateCreate])
	SELECT @countSuccess, @countError, @countQueue, GETDATE()
	```
	- final script is run on the MS SQL Server
3. **Load data file.**
	- in setting in section **mssql.queries** find query whose key is equal to param **scan.queryLoadKey**
	- first part of the query is generated by setting **scan.modeLoad**. Founded query is added to it, examples:

| scan.modeLoad | read file mode | query example |
| ------------- | -------------- | ------------- |
| "bodyAsUtf8" | read file as text in utf8 | [example 1](#example1) |
| "bodyAsBase64" | read file as text in base64 | [example 1](#example1) |
| "bodyAsBinary" | read file as text in binary (hex) | [example 2](#example2) |
| "fullFileName" | do not read file body | [example 3](#example3) |
| "xlsx2json" | read XLSX by the converter to JSON| [example 1](#example1) |
| "xlsx2xml" | read XLSX by the converter to XML | [example 4](#example4) |
| "xml2xml" | read XML by the converter to XML | [example 4](#example4) |

##### <a id="example1">example 1</a>
```sql
-- first path
DECLARE @filePath NVARCHAR(MAX); SET @filePath = '/home/vitalii/importfile'
DECLARE @fileNameWithoutExt NVARCHAR(MAX); SET @fileNameWithoutExt = 'test1'
DECLARE @fileExt NVARCHAR(MAX); SET @fileExt = '.txt'
DECLARE @data NVARCHAR(MAX)
SET @data = '...data from file...'
-- example your query in setting
EXEC [dbo].[YourStoredProcedure1]
	@filePath = @filePath,
	@fileNameWithoutExt = @fileNameWithoutExt,
	@fileExt = @fileExt,
	@fileDataAsText = @data
```
##### <a id="example2">example 2</a>
```sql
-- first path
DECLARE @filePath NVARCHAR(MAX); SET @filePath = '/home/vitalii/importfile'
DECLARE @fileNameWithoutExt NVARCHAR(MAX); SET @fileNameWithoutExt = 'test2'
DECLARE @fileExt NVARCHAR(MAX); SET @fileExt = '.png'
DECLARE @data VARBINARY(MAX)
SET @data = 0x12345
-- example your query in setting
EXEC [dbo].[YourStoredProcedure2]
	@filePath = @filePath,
	@fileNameWithoutExt = @fileNameWithoutExt,
	@fileExt = @fileExt,
	@fileDataAsText = @data
```
##### <a id="example3">example 3</a>
```sql
-- first path
DECLARE @filePath NVARCHAR(MAX); SET @filePath = '/home/vitalii/importfile'
DECLARE @fileNameWithoutExt NVARCHAR(MAX); SET @fileNameWithoutExt = 'test3'
DECLARE @fileExt NVARCHAR(MAX); SET @fileExt = '.txt'
DECLARE @data NVARCHAR(1)
SET @data = ''
-- example your query in setting
EXEC [dbo].[YourStoredProcedure3]
	@filePath = @filePath,
	@fileNameWithoutExt = @fileNameWithoutExt,
	@fileExt = @fileExt,
```
##### <a id="example4">example 4</a>
```sql
-- first path
DECLARE @filePath NVARCHAR(MAX); SET @filePath = '/home/vitalii/importfile'
DECLARE @fileNameWithoutExt NVARCHAR(MAX); SET @fileNameWithoutExt = 'test1'
DECLARE @fileExt NVARCHAR(MAX); SET @fileExt = '.txt'
DECLARE @data XML
SET @data = '<...xml data from file.../>'
-- example your query in setting
EXEC [dbo].[YourStoredProcedure4]
	@filePath = @filePath,
	@fileNameWithoutExt = @fileNameWithoutExt,
	@fileExt = @fileExt,
	@fileDataAsText = @data
```