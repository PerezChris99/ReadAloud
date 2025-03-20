import pyttsx3
import threading
import queue
from PyQt5.QtCore import QObject, pyqtSignal

class TTSCommand:
    """Command objects for the TTS queue"""
    def __init__(self, command_type, value=None):
        self.type = command_type  # 'play', 'pause', 'stop', 'rate', 'volume', 'rewind', 'forward'
        self.value = value

class TTSEngine(QObject):
    """Text-to-speech engine that runs in a separate thread"""
    
    status_changed = pyqtSignal(str)
    
    def __init__(self):
        super().__init__()
        self.engine = pyttsx3.init()
        self.text = ""
        self.current_position = 0
        self.is_paused = False
        self.is_stopped = True
        
        # Default properties
        self.engine.setProperty('rate', 150)  # Speed (words per minute)
        self.engine.setProperty('volume', 0.75)  # Volume (0.0 to 1.0)
        
        # Command queue for thread communication
        self.command_queue = queue.Queue()
        
        # Worker thread
        self.worker_thread = None
    
    def set_text(self, text):
        """Set the text to be read"""
        self.text = text
        self.current_position = 0
        self.is_stopped = True
        self.is_paused = False
    
    def play(self):
        """Start or resume reading"""
        if self.is_stopped:
            self.is_stopped = False
            self.is_paused = False
            
            # Start worker thread if not running
            if not self.worker_thread or not self.worker_thread.is_alive():
                self.worker_thread = threading.Thread(target=self._worker)
                self.worker_thread.daemon = True
                self.worker_thread.start()
                
            # Send play command to the worker
            self.command_queue.put(TTSCommand('play'))
        elif self.is_paused:
            # Resume from paused state
            self.is_paused = False
            self.command_queue.put(TTSCommand('play'))
    
    def pause(self):
        """Pause reading"""
        if not self.is_stopped and not self.is_paused:
            self.is_paused = True
            self.command_queue.put(TTSCommand('pause'))
    
    def stop(self):
        """Stop reading and reset position"""
        if not self.is_stopped:
            self.is_stopped = True
            self.is_paused = False
            self.current_position = 0
            self.command_queue.put(TTSCommand('stop'))
    
    def rewind(self):
        """Rewind by approximately 5 seconds"""
        if self.text:
            # Approximate rewind by character count 
            # (assumes 15 characters per second at normal speed)
            chars_per_second = 15 * (self.engine.getProperty('rate') / 150)
            rewind_chars = int(5 * chars_per_second)
            
            new_position = max(0, self.current_position - rewind_chars)
            
            was_playing = not self.is_paused and not self.is_stopped
            self.stop()
            
            self.current_position = new_position
            
            if was_playing:
                self.play()
    
    def forward(self):
        """Forward by approximately 5 seconds"""
        if self.text:
            # Approximate forward by character count
            chars_per_second = 15 * (self.engine.getProperty('rate') / 150)
            forward_chars = int(5 * chars_per_second)
            
            new_position = min(len(self.text), self.current_position + forward_chars)
            
            was_playing = not self.is_paused and not self.is_stopped
            self.stop()
            
            self.current_position = new_position
            
            if was_playing:
                self.play()
    
    def set_rate(self, rate):
        """Set speech rate (speed)"""
        self.command_queue.put(TTSCommand('rate', rate * 100))
    
    def set_volume(self, volume):
        """Set speech volume (0.0 to 1.0)"""
        self.command_queue.put(TTSCommand('volume', volume))
    
    def _worker(self):
        """Worker thread that processes TTS commands"""
        engine = self.engine
        
        # Setup callbacks
        def onWord(name, location, length):
            self.current_position = location
        
        def onEnd(name, completed):
            if completed:
                self.is_stopped = True
                self.current_position = 0
        
        engine.connect('started-word', onWord)
        engine.connect('finished-utterance', onEnd)
        
        while not self.is_stopped or not self.command_queue.empty():
            try:
                # Check for commands
                try:
                    cmd = self.command_queue.get(block=False)
                    
                    if cmd.type == 'play':
                        if self.is_paused:
                            engine.resume()
                        else:
                            # Start from current position
                            text_to_read = self.text[self.current_position:]
                            engine.say(text_to_read)
                            engine.runAndWait()
                    
                    elif cmd.type == 'pause':
                        engine.pause()
                    
                    elif cmd.type == 'stop':
                        engine.stop()
                    
                    elif cmd.type == 'rate':
                        engine.setProperty('rate', cmd.value)
                    
                    elif cmd.type == 'volume':
                        engine.setProperty('volume', cmd.value)
                    
                    self.command_queue.task_done()
                    
                except queue.Empty:
                    # No commands to process
                    pass
                
                # Small delay to prevent CPU hogging
                threading.Event().wait(0.1)
                
            except Exception as e:
                print(f"TTS worker error: {str(e)}")
                break
