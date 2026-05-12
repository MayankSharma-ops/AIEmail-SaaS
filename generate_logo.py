from PIL import Image, ImageDraw

size = 512
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Blue circle
circle_color = '#0055FF'
draw.ellipse([0, 0, size-1, size-1], fill=circle_color)

# White envelope
w = 300
h = 200
x0 = (size - w) // 2
y0 = (size - h) // 2
x1 = x0 + w
y1 = y0 + h

# Draw the bottom part of the envelope
draw.polygon([
    (x0, y0),         # top-left
    (x0, y1),         # bottom-left
    (x1, y1),         # bottom-right
    (x1, y0),         # top-right
    (size//2, y0 + h//2 + 20) # center bottom of flap
], fill='white')

# Draw the top flap (triangle) with a slight gap
gap = 12
draw.polygon([
    (x0 + gap, y0), 
    (x1 - gap, y0), 
    (size//2, y0 + h//2 + 20 - gap*1.5)
], fill='white')

img.save('public/logo.png')

# Also generate favicon.png and favicon.ico for best compatibility
img.resize((32, 32), Image.Resampling.LANCZOS).save('public/favicon.png')
img.resize((32, 32), Image.Resampling.LANCZOS).save('public/favicon.ico')

print("Logos generated successfully!")
