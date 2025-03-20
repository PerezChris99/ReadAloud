import os
from PyQt5.QtWidgets import (QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
                             QPushButton, QTextEdit, QFileDialog, QSlider, 
                             QLabel, QMessageBox, QProgressBar)
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtGui import QIcon, QFont

from utils.text_extractor import TextExtractor
from utils.tts_engine import TTSEngine

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        
        self.setWindowTitle("ReadAloud - Text to Speech Reader")
        self.setMinimumSize(800, 600)
        
        self.text_extractor = TextExtractor()
        self.tts_engine = TTSEngine()
        self.current_file = None
        self.extracted_text = ""
        
        self.init_ui()
        
    def init_ui(self):
        # Main widget and layout
        main_widget = QWidget()
        main_layout = QVBoxLayout(main_widget)
        
        # File selection button
        file_button = QPushButton("Upload Document")
        file_button.setFont(QFont("Arial", 10))
        file_button.setMinimumHeight(40)
        file_button.clicked.connect(self.open_file_dialog)
        
        # Text display area
        self.text_display = QTextEdit()
        self.text_display.setReadOnly(True)
        self.text_display.setFont(QFont("Arial", 11))
        
        # Control buttons layout
        control_layout = QHBoxLayout()
        
        # Rewind button
        self.rewind_button = QPushButton("⏪ -5s")
        self.rewind_button.clicked.connect(self.rewind)
        
        # Play button
        self.play_button = QPushButton("▶️ Play")
        self.play_button.clicked.connect(self.play)
        
        # Pause button
        self.pause_button = QPushButton("⏸️ Pause")
        self.pause_button.clicked.connect(self.pause)
        
        # Stop button
        self.stop_button = QPushButton("⏹️ Stop")
        self.stop_button.clicked.connect(self.stop)
        
        # Forward button
        self.forward_button = QPushButton("⏩ +5s")
        self.forward_button.clicked.connect(self.forward)
        
        # Add buttons to control layout
        control_layout.addWidget(self.rewind_button)
        control_layout.addWidget(self.play_button)
        control_layout.addWidget(self.pause_button)
        control_layout.addWidget(self.stop_button)
        control_layout.addWidget(self.forward_button)
        
        # Speed control
        speed_layout = QHBoxLayout()
        speed_label = QLabel("Speed:")
        self.speed_slider = QSlider(Qt.Horizontal)
        self.speed_slider.setMinimum(50)
        self.speed_slider.setMaximum(250)
        self.speed_slider.setValue(150)
        self.speed_slider.setTickPosition(QSlider.TicksBelow)
        self.speed_slider.setTickInterval(25)
        self.speed_slider.valueChanged.connect(self.change_speed)
        self.speed_value_label = QLabel("1.5x")
        
        speed_layout.addWidget(speed_label)
        speed_layout.addWidget(self.speed_slider)
        speed_layout.addWidget(self.speed_value_label)
        
        # Volume control
        volume_layout = QHBoxLayout()
        volume_label = QLabel("Volume:")
        self.volume_slider = QSlider(Qt.Horizontal)
        self.volume_slider.setMinimum(0)
        self.volume_slider.setMaximum(100)
        self.volume_slider.setValue(75)
        self.volume_slider.setTickPosition(QSlider.TicksBelow)
        self.volume_slider.setTickInterval(10)
        self.volume_slider.valueChanged.connect(self.change_volume)
        self.volume_value_label = QLabel("75%")
        
        volume_layout.addWidget(volume_label)
        volume_layout.addWidget(self.volume_slider)
        volume_layout.addWidget(self.volume_value_label)
        
        # Status indicator
        self.status_bar = QProgressBar()
        self.status_bar.setTextVisible(False)
        self.status_bar.setMaximum(100)
        self.status_bar.setValue(0)
        
        # Add all components to main layout
        main_layout.addWidget(file_button)
        main_layout.addWidget(self.text_display)
        main_layout.addLayout(control_layout)
        main_layout.addLayout(speed_layout)
        main_layout.addLayout(volume_layout)
        main_layout.addWidget(self.status_bar)
        
        self.setCentralWidget(main_widget)
        
        # Disable buttons initially
        self.toggle_controls(False)
        
    def toggle_controls(self, enable=True):
        self.play_button.setEnabled(enable)
        self.pause_button.setEnabled(enable)
        self.stop_button.setEnabled(enable)
        self.rewind_button.setEnabled(enable)
        self.forward_button.setEnabled(enable)
        self.speed_slider.setEnabled(enable)
        self.volume_slider.setEnabled(enable)
    
    def open_file_dialog(self):
        file_filter = "Documents (*.pdf *.docx *.txt *.epub *.png *.jpg *.jpeg)"
        file_path, _ = QFileDialog.getOpenFileName(self, "Select Document", "", file_filter)
        
        if file_path:
            self.current_file = file_path
            self.process_file(file_path)
    
    def process_file(self, file_path):
        try:
            self.status_bar.setValue(10)
            self.extracted_text = self.text_extractor.extract_text(file_path)
            self.status_bar.setValue(100)
            
            if self.extracted_text:
                self.text_display.setText(self.extracted_text)
                self.toggle_controls(True)
                self.tts_engine.set_text(self.extracted_text)
            else:
                QMessageBox.warning(self, "Extraction Error", 
                                  "Could not extract text from the selected file.")
                self.toggle_controls(False)
        
        except Exception as e:
            QMessageBox.critical(self, "Error", f"An error occurred: {str(e)}")
            self.status_bar.setValue(0)
            self.toggle_controls(False)
    
    def play(self):
        if self.extracted_text:
            self.tts_engine.play()
    
    def pause(self):
        self.tts_engine.pause()
    
    def stop(self):
        self.tts_engine.stop()
    
    def rewind(self):
        self.tts_engine.rewind()
    
    def forward(self):
        self.tts_engine.forward()
    
    def change_speed(self):
        speed = self.speed_slider.value() / 100
        self.speed_value_label.setText(f"{speed:.1f}x")
        self.tts_engine.set_rate(speed)
    
    def change_volume(self):
        volume = self.volume_slider.value()
        self.volume_value_label.setText(f"{volume}%")
        self.tts_engine.set_volume(volume / 100)
    
    def closeEvent(self, event):
        self.tts_engine.stop()
        event.accept()
