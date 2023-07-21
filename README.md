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
Parameter "key" must be unique within all items in this param array. Details will be specified below in the [queries section](#queries)
4. **"mssql.queryLoadErrorKey".** Refer to **mssql.queries** for loading errors to MS SQL Server. Details will be specified below in the "errors" section
5. **"mssql.queryLoadDigestKey".** Refer to **mssql.queries** for periodic loading statistics about the service work to MS SQL Server. Details will be specified below in the [queries section](#queries)
6. **"fs.*".** Сontains all directories which service uses in its work - scan new file for load it to MS SQL Server, move loaded file to another directory. Parameter "key" must be unique within all items in this param array.
7. **"scan".** Array of rules by which files are searched for uploading to the MS SQL Server. Each item consist of
	- **"pathKey".** Directory for scan. Refer to **fs**. Сan be specified with subdirectories.
	- **"mask".** File mask. Can be specified with subdirectories, but mask symbols can only contain file name. Good masks: *"\*.txt"*, *"/subfolder/\*.txt"*. Bad masks: *"/subfolder\*/\*.txt"*, *"/subfolder/\*/\*.txt"*.
	- **"modeLoad".** File read option. Details will be specified below in the [queries section](#queries)
	- **"logFileErrorPathKey".** Directory for moving files that failed to load to MS SQL Server
	- **"logFileSuccessPathKey".** Directory for moving files that were successfully uploaded to the server
	- **"queryLoadKey".** Query for load file data to MS SQL Server. Refer to **mssql.queries**. Details will be specified below in the [queries section](#queries)
8. **"service.holdManual".** Various options for pausing the service or stopping it.
	- **"holdManual".**  If this parameter is set to "success", the service will pause. Files will not be loaded to the MS SQL SERver at this time
	- **"stop".** Setting the service stop time (examples: "03:45", "23:15"). If additional third-party mechanisms are used to autostart a stopped service, the service will be restarted
	- **"holdAuto".** Setting the time period during which the service will not loaded data to MS SQL Server (**duration** in minutes). If, for example, "saturday": {"time": "23:30", "duration": 120}, service will not work from saturday 23:30 to sunday 01:30
9. **"log".** Service writes logs to "log" folder, which is located in the same directory.
	- **"logAllowTrace".** Enable or disable "trace" level. Other levels ("debug" and "error") are always enabled
	- **"logLifeDays".** How many days to keep files in "log" folder
	- **"logFileErrorLifeDays", "logFileSuccessLifeDays".** This settings are not used

## <a id="queries">4. Queries</a>

Service load to MS SQL Server data files, errors and digest. Digest - service statistics (how many files were loaded successfully, loadin how many files caused an error) generated every 10 minutes. Can be used to check that the service is running.

1. **Load errors.** every minute, based on the accumulated errors
	- in setting in section **mssql.queries** find query whose key is equal to param **mssql.queryLoadErrorKey**
	- if query is not found, load errors to MS SQL Server will not happen
	- first part of the query is generated. Founded query is added to it, example:
	```sql
	-- first path
	IF OBJECT_ID('tempdb..#mssqlapifile_app_errors') IS NOT NULL DROP TABLE #mssqlapifile_app_errors
	CREATE TABLE #mssqlapifile_app_errors([id] INT IDENTITY(1,1), [message] NVARCHAR(MAX))
	INSERT INTO #mssqlapifile_app_errors([message])
	SELECT 'text for error 1' UNION ALL
	SELECT 'text for error 2'
	-- example founded query in setting
	INSERT INTO [dbo].[YourErrorStorage] ([message])
	SELECT [message] FROM #mssqlapifile_app_errors ORDER BY [id]
	```
	- final script is run on the MS SQL Server
2. **Load digest.** every 10 minute
	- in setting in section **mssql.queries** find query whose key is equal to param **mssql.queryLoadDigestKey**
	- if query is not found, load digest to MS SQL Server will not happen
	- first part of the query is generated. Founded query is added to it, example:
	```sql
	-- first path
    DECLARE @countSuccess INT; SET @countSuccess = 45
    DECLARE @countError INT; SET @countError = 2
    DECLARE @countQueue INT; SET @countQueue = 0
	-- example founded query in setting
	INSERT INTO [dbo].[YourDigestStorage] ([countSuccess], [countError], [countQueue], [dateCreate])
	SELECT @countSuccess, @countError, @countQueue, GETDATE()
	```
	- final script is run on the MS SQL Server
3. **Load data file.**
	- in setting in section **mssql.queries** find query whose key is equal to param **scan.queryLoadKey**
	- first part of the query is generated by setting **scan.modeLoad**. Founded query is added to it, examples:
<table>
	<tr>
		<th>scan.modeLoad</th>
		<th>read file mode</th>
		<th>query example</th>
	</tr>
	<tr>
		<td>"bodyAsUtf8", "bodyAsBase64"</td>
		<td>read file as text in utf8 or in base64</td>
		<td>
			-- first path<br>
			DECLARE @filePath NVARCHAR(MAX); SET @filePath = '/home/vitalii/importfile'<br>
			DECLARE @fileNameWithoutExt NVARCHAR(MAX); SET @fileNameWithoutExt = 'test1'<br>
			DECLARE @fileExt NVARCHAR(MAX); SET @fileExt = '.txt'<br>
			DECLARE @data NVARCHAR(MAX)<br>
			SET @data = '...data from file...'<br>
			-- example founded query in setting<br>
			EXEC [dbo].[YourStoredProcedure1]<br>
				&emsp;&emsp;@filePath = @filePath,<br>
				&emsp;&emsp;@fileNameWithoutExt = @fileNameWithoutExt,<br>
				&emsp;&emsp;@fileExt = @fileExt,<br>
				&emsp;&emsp;@fileDataAsText = @data<br>
		</td>
	</tr>
	<tr>
		<td>"bodyAsBinary"</td>
		<td>read file as text in binary (hex)</td>
		<td>
			-- first path<br>
			DECLARE @filePath NVARCHAR(MAX); SET @filePath = '/home/vitalii/importfile'<br>
			DECLARE @fileNameWithoutExt NVARCHAR(MAX); SET @fileNameWithoutExt = 'test2'<br>
			DECLARE @fileExt NVARCHAR(MAX); SET @fileExt = '.png'<br>
			DECLARE @data VARBINARY(MAX)<br>
			SET @data = 0x12345<br>
			-- example founded query in setting<br>
			EXEC [dbo].[YourStoredProcedure2]<br>
				&emsp;&emsp;@filePath = @filePath,<br>
				&emsp;&emsp;@fileNameWithoutExt = @fileNameWithoutExt,<br>
				&emsp;&emsp;@fileExt = @fileExt,<br>
				&emsp;&emsp;@fileDataAsText = @data<br>
		</td>
	</tr>
	<tr>
		<td>"fullFileName"</td>
		<td>do not read file</td>
		<td>
			-- first path<br>
			DECLARE @filePath NVARCHAR(MAX); SET @filePath = '/home/vitalii/importfile'<br>
			DECLARE @fileNameWithoutExt NVARCHAR(MAX); SET @fileNameWithoutExt = 'test3'<br>
			DECLARE @fileExt NVARCHAR(MAX); SET @fileExt = '.txt'<br>
			DECLARE @data NVARCHAR(1)<br>
			SET @data = ''<br>
			-- example founded query in setting<br>
			EXEC [dbo].[YourStoredProcedure3]<br>
				&emsp;&emsp;@filePath = @filePath,<br>
				&emsp;&emsp;@fileNameWithoutExt = @fileNameWithoutExt,<br>
				&emsp;&emsp;@fileExt = @fileExt,<br>
		</td>
	</tr>
	<tr>
		<td>"xlsx2json", "xlsx2xml"</td>
		<td>read file with xlsx data by converter, convert data to json or xml</td>
		<td>
			like in scan.modeLoad "bodyAsUtf8" and "bodyAsBase64"
		</td>
	</tr>
	<tr>
		<td>"xml2xml"</td>
		<td>read file with xml data by converter, convert data xml</td>
		<td>
			-- first path<br>
			DECLARE @filePath NVARCHAR(MAX); SET @filePath = '/home/vitalii/importfile'<br>
			DECLARE @fileNameWithoutExt NVARCHAR(MAX); SET @fileNameWithoutExt = 'test4'<br>
			DECLARE @fileExt NVARCHAR(MAX); SET @fileExt = '.xml'<br>
			DECLARE @data XML<br>
			SET @data = '...data from file...'<br>
			-- example founded query in setting<br>
			EXEC [dbo].[YourStoredProcedure1]<br>
				&emsp;&emsp;@filePath = @filePath,<br>
				&emsp;&emsp;@fileNameWithoutExt = @fileNameWithoutExt,<br>
				&emsp;&emsp;@fileExt = @fileExt,<br>
				&emsp;&emsp;@fileDataAsText = @data<br>
		</td>
	</tr>
</table>