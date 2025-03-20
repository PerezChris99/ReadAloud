@echo off
echo Starting ReadAloud application...

REM Activate virtual environment
call env\Scripts\activate

REM Run the application
python main.py

REM Deactivate virtual environment when done
deactivate
pause
