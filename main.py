import os
import sys
from PyQt5.QtWidgets import (QApplication, QMainWindow, QPushButton, QFileDialog, 
                            QVBoxLayout, QHBoxLayout, QWidget, QLabel, QTextEdit,
                            QSlider, QComboBox)
from PyQt5.QtCore import Qt
import pyttsx3
import fitz  # PyMuPDF
from docx import Document
from PIL import Image
import pytesseract
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup

class ReadAloudApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.initUI()
        self.init_tts_engine()
        self.current_file = None
        self.text_content = ""
        
    def initUI(self):
        self.setWindowTitle('ReadAloud - Document Reader')
        self.setGeometry(100, 100, 800, 600)
        
        # Main widget and layout
        main_widget = QWidget()
        main_layout = QVBoxLayout()
        
        # File selection area
        file_layout = QHBoxLayout()
        self.file_path_label = QLabel("No file selected")
        file_layout.addWidget(QLabel("Document:"))
        file_layout.addWidget(self.file_path_label)
        file_layout.addStretch(1)
        
        browse_button = QPushButton("Browse...")
        browse_button.clicked.connect(self.open_file)
        file_layout.addWidget(browse_button)
        
        # Text area
        self.text_display = QTextEdit()
        self.text_display.setReadOnly(True)
        
        # Voice controls
        voice_layout = QHBoxLayout()
        voice_layout.addWidget(QLabel("Voice:"))
        self.voice_combo = QComboBox()
        voice_layout.addWidget(self.voice_combo)
        
        voice_layout.addWidget(QLabel("Rate:"))
        self.rate_slider = QSlider(Qt.Horizontal)
        self.rate_slider.setMinimum(100)
        self.rate_slider.setMaximum(300)
        self.rate_slider.setValue(200)
        self.rate_slider.valueChanged.connect(self.update_rate)
        voice_layout.addWidget(self.rate_slider)
        
        # Playback controls
        button_layout = QHBoxLayout()
        
        self.play_button = QPushButton("Play")
        self.play_button.clicked.connect(self.play_text)
        self.play_button.setEnabled(False)
        
        self.pause_button = QPushButton("Pause")
        self.pause_button.clicked.connect(self.pause_text)
        self.pause_button.setEnabled(False)
        
        self.stop_button = QPushButton("Stop")
        self.stop_button.clicked.connect(self.stop_text)
        self.stop_button.setEnabled(False)
        
        button_layout.addWidget(self.play_button)
        button_layout.addWidget(self.pause_button)
        button_layout.addWidget(self.stop_button)
        
        # Add all layouts to main layout
        main_layout.addLayout(file_layout)
        main_layout.addWidget(self.text_display)
        main_layout.addLayout(voice_layout)
        main_layout.addLayout(button_layout)
        
        main_widget.setLayout(main_layout)
        self.setCentralWidget(main_widget)
    
    def init_tts_engine(self):
        self.engine = pyttsx3.init()
        self.engine.setProperty('rate', 200)  # Default rate
        
        # Populate voice selection
        voices = self.engine.getProperty('voices')
        for voice in voices:
            self.voice_combo.addItem(voice.name, voice.id)
        
        self.voice_combo.currentIndexChanged.connect(self.change_voice)
        if voices:
            self.engine.setProperty('voice', voices[0].id)
    
    def change_voice(self, index):
        voice_id = self.voice_combo.itemData(index)
        self.engine.setProperty('voice', voice_id)
    
    def update_rate(self):
        rate = self.rate_slider.value()
        self.engine.setProperty('rate', rate)
    
    def open_file(self):
        file_filter = "Documents (*.pdf *.docx *.txt *.epub *.jpg *.png);;PDF Files (*.pdf);;Word Documents (*.docx);;Text Files (*.txt);;EPUB Files (*.epub);;Images (*.jpg *.png)"
        file_path, _ = QFileDialog.getOpenFileName(self, "Open Document", "", file_filter)
        
        if file_path:
            self.current_file = file_path
            self.file_path_label.setText(os.path.basename(file_path))
            self.load_document(file_path)
    
    def load_document(self, file_path):
        self.text_content = ""
        extension = os.path.splitext(file_path)[1].lower()
        
        try:
            if extension == '.pdf':
                self.text_content = self.extract_text_from_pdf(file_path)
            elif extension == '.docx':
                self.text_content = self.extract_text_from_docx(file_path)
            elif extension == '.txt':
                with open(file_path, 'r', encoding='utf-8') as file:
                    self.text_content = file.read()
            elif extension == '.epub':
                self.text_content = self.extract_text_from_epub(file_path)
            elif extension in ['.jpg', '.png', '.jpeg']:
                self.text_content = self.extract_text_from_image(file_path)
            
            self.text_display.setPlainText(self.text_content)
            self.play_button.setEnabled(bool(self.text_content))
            
        except Exception as e:
            self.text_display.setPlainText(f"Error loading document: {str(e)}")
            self.play_button.setEnabled(False)
    
    def extract_text_from_pdf(self, file_path):
        text = ""
        try:
            doc = fitz.open(file_path)
            for page in doc:
                text += page.get_text()
            doc.close()
        except Exception as e:
            text = f"Error extracting PDF text: {str(e)}"
        return text
    
    def extract_text_from_docx(self, file_path):
        text = ""
        try:
            doc = Document(file_path)
            for para in doc.paragraphs:
                text += para.text + "\n"
        except Exception as e:
            text = f"Error extracting DOCX text: {str(e)}"
        return text
    
    def extract_text_from_epub(self, file_path):
        text = ""
        try:
            book = epub.read_epub(file_path)
            for item in book.get_items():
                if item.get_type() == ebooklib.ITEM_DOCUMENT:
                    content = item.get_content()
                    soup = BeautifulSoup(content, 'html.parser')
                    text += soup.get_text() + "\n"
        except Exception as e:
            text = f"Error extracting EPUB text: {str(e)}"
        return text
    
    def extract_text_from_image(self, file_path):
        try:
            image = Image.open(file_path)
            text = pytesseract.image_to_string(image)
            return text
        except Exception as e:
            return f"Error extracting text from image: {str(e)}"
    
    def play_text(self):
        if self.text_content:
            self.engine.say(self.text_content)
            self.engine.runAndWait()
            self.play_button.setEnabled(False)
            self.pause_button.setEnabled(True)
            self.stop_button.setEnabled(True)
    
    def pause_text(self):
        self.engine.stop()
        self.play_button.setEnabled(True)
        self.pause_button.setEnabled(False)
    
    def stop_text(self):
        self.engine.stop()
        self.play_button.setEnabled(True)
        self.pause_button.setEnabled(False)
        self.stop_button.setEnabled(False)

def main():
    app = QApplication(sys.argv)
    window = ReadAloudApp()
    window.show()
    sys.exit(app.exec_())

if __name__ == "__main__":
    main()
